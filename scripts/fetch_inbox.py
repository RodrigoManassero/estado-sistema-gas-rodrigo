#!/usr/bin/env python3
"""Pull PDF/XLSX attachments from a dedicated Gmail mailbox into raw/incoming/.

Use case: dispatch desk forwards parts diarios (TGS / TGN PDFs, despacho
Excels) to a mailbox we control. Every pipeline run polls the inbox, drops
matched attachments into raw/incoming/, and `ingest_incoming.py` (next phase
of build_data.py) routes them by magic bytes — same as a manual drop.

Configuration via env vars (set as GitHub Action secrets in production):
    GMAIL_USER             — full address of the dedicated mailbox
    GMAIL_APP_PASSWORD     — 16-char Gmail App Password (2FA-derived)

Local dev: leave GMAIL_APP_PASSWORD unset and the script no-ops cleanly.

Security: hard allow-list of sender addresses + DKIM-pass requirement.
Anything else is left in the inbox unread for human review.
"""

import email
import imaplib
import os
import re
import sys
from email.message import Message

INCOMING_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw', 'incoming')

ALLOWED_SENDERS = {
    # Specific addresses that are authorised to feed parts. Use lowercase.
    # Empty by default — domain allow-list below is the primary mechanism.
}

ALLOWED_SENDER_DOMAINS = {
    # Whole domains. Anything @<domain> is accepted.
    'pluspetrol.net',
    'tgs.com.ar',
    'tgn.com.ar',
}

ALLOWED_EXTS = ('.pdf', '.xlsx', '.xls')
PDF_MAGIC = b'%PDF-'
XLSX_MAGIC = b'PK\x03\x04'  # ZIP container — XLSX is a zip
XLS_MAGIC = b'\xd0\xcf\x11\xe0'  # OLE compound (legacy .xls)


def safe_filename(s: str) -> str:
    """Strip path separators and exotic chars; cap at 80."""
    s = re.sub(r'[^A-Za-z0-9._-]', '_', s)
    return s[:80]


def has_dkim_pass(msg: Message) -> bool:
    """Defence in depth — accept only mails that passed DKIM at the receiving
    server. Gmail records this in Authentication-Results."""
    for header in msg.get_all('Authentication-Results') or []:
        if 'dkim=pass' in header.lower():
            return True
    return False


def address_of(field: str | None) -> str:
    """'Foo Bar <foo@bar.com>' -> 'foo@bar.com'. Empty string if missing."""
    if not field:
        return ''
    m = re.search(r'[\w._%+-]+@[\w.-]+', field)
    return m.group(0).lower() if m else ''


def magic_ok(content: bytes, ext: str) -> bool:
    if ext == '.pdf':
        return content[:5] == PDF_MAGIC
    if ext == '.xlsx':
        return content[:4] == XLSX_MAGIC
    if ext == '.xls':
        return content[:4] == XLS_MAGIC
    return False


def save_attachment(content: bytes, original_name: str) -> str | None:
    """Drop an attachment into raw/incoming/ if it passes magic-byte checks.

    Filename is preserved (sanitised). ingest_incoming.py classifies by
    prefix (^etgs, ^ps_, etc.), so we must NOT prepend timestamps. If the
    same filename arrives twice it gets overwritten — desirable for the
    common case of "latest version of today's report".
    """
    ext = os.path.splitext(original_name.lower())[1]
    if ext not in ALLOWED_EXTS:
        return None
    if not magic_ok(content, ext):
        return None
    fname = safe_filename(original_name)
    dest = os.path.join(INCOMING_DIR, fname)
    with open(dest, 'wb') as f:
        f.write(content)
    return dest


def process_message(raw_msg: bytes, summary: list[str]) -> int:
    """Save matched attachments. Return number saved."""
    msg = email.message_from_bytes(raw_msg)
    sender = address_of(msg.get('From'))
    sender_domain = sender.split('@', 1)[1] if '@' in sender else ''
    if sender not in ALLOWED_SENDERS and sender_domain not in ALLOWED_SENDER_DOMAINS:
        summary.append(f'  SKIP from={sender}: not in allow-list')
        return 0
    if not has_dkim_pass(msg):
        summary.append(f'  SKIP from={sender}: DKIM did not pass')
        return 0
    saved = 0
    for part in msg.walk():
        if part.is_multipart():
            continue
        filename = part.get_filename()
        if not filename:
            continue
        try:
            content = part.get_payload(decode=True)
        except Exception:
            continue
        if not isinstance(content, bytes) or len(content) == 0:
            continue
        dest = save_attachment(content, filename)
        if dest:
            saved += 1
            summary.append(f'  OK   from={sender}: {os.path.basename(dest)}')
    return saved


def main():
    user = os.environ.get('GMAIL_USER', '').strip()
    pw = os.environ.get('GMAIL_APP_PASSWORD', '').strip()
    if not user or not pw:
        print('fetch_inbox: GMAIL_USER/GMAIL_APP_PASSWORD not set, skipping')
        return 0
    if not ALLOWED_SENDERS and not ALLOWED_SENDER_DOMAINS:
        print('fetch_inbox: allow-list empty, refusing to ingest anything', file=sys.stderr)
        return 0

    os.makedirs(INCOMING_DIR, exist_ok=True)

    summary: list[str] = []
    saved_total = 0
    try:
        m = imaplib.IMAP4_SSL('imap.gmail.com')
        m.login(user, pw)
        m.select('INBOX')
        typ, data = m.search(None, 'UNSEEN')
        if typ != 'OK':
            print(f'fetch_inbox: SEARCH failed: {typ}', file=sys.stderr)
            return 1
        ids = data[0].split()
        print(f'fetch_inbox: {len(ids)} unread messages')
        for mid in ids:
            typ, msg_data = m.fetch(mid, '(RFC822)')
            if typ != 'OK' or not msg_data or not msg_data[0]:
                continue
            raw_payload = msg_data[0][1] if isinstance(msg_data[0], tuple) else None
            if not isinstance(raw_payload, (bytes, bytearray)):
                continue
            saved = process_message(bytes(raw_payload), summary)
            saved_total += saved
            # Mark read regardless — we've inspected it.
            m.store(mid, '+FLAGS', '\\Seen')
        m.close()
        m.logout()
    except imaplib.IMAP4.error as e:
        print(f'fetch_inbox: IMAP error: {e}', file=sys.stderr)
        return 1

    for line in summary:
        print(line)
    print(f'fetch_inbox: saved {saved_total} attachments to raw/incoming/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
