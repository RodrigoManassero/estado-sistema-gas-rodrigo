// Public GitHub repo where this project lives. Used to build audit links
// from the Fuentes page to the scripts and dataset fichas on GitHub.

export const REPO_OWNER = 'mpodeley'
export const REPO_NAME = 'estado-red-gas'
export const REPO_BRANCH = 'master'
export const REPO_ROOT = `https://github.com/${REPO_OWNER}/${REPO_NAME}`
export const REPO_BLOB = `${REPO_ROOT}/blob/${REPO_BRANCH}`

// Build a URL pointing at a file in the repo at master. `repoPath` is relative
// to the repo root (no leading slash), e.g. "scripts/fetch_enargas.py".
export function githubFileUrl(repoPath: string): string {
  const clean = repoPath.replace(/^\/+/, '')
  return `${REPO_BLOB}/${clean}`
}
