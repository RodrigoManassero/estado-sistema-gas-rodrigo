#!/usr/bin/env python3
"""
Pruebas de scripts/generate_forecast.py: anclaje de usinas al programa semanal de CAMMESA y estimacion por
persistencia + temperatura para los dias sin programa (ver MODELO_USINAS.md).

Uso (desde la raiz del repo):   python tests/test_generate_forecast.py
Usa datos sinteticos con resultados calculables a mano; no toca public/data ni raw/.
"""
import csv
import importlib.util
import json
import math
import os
import random
import shutil
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / 'scripts'
OK = FAIL = 0


def check(nombre, cond):
    global OK, FAIL
    if cond:
        OK += 1
        print('  OK  ', nombre)
    else:
        FAIL += 1
        print('  FAIL', nombre)


def cerca(a, b, tol=0.051):
    return a is not None and b is not None and abs(a - b) <= tol


def importar():
    sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location('gf', str(SCRIPTS / 'generate_forecast.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# =============================== PARTE A: funciones ===============================
def parte_a(gf):
    print('A. funciones puras')
    # A1: el ajuste recupera coeficientes conocidos
    d0 = date(2026, 1, 5)
    temp, prog = {}, {}
    for i in range(140):
        d = d0 + timedelta(days=i)
        t = 19 + 9 * math.sin(i / 5.0)
        temp[d] = t
        prog[d] = 22 + 0.3 * max(0, 17 - t) + 1.5 * max(0, t - 22)
    beta, n = gf.fit_beta_temperatura(prog, temp)
    check('ajuste de coeficientes: recupera b_frio=0,3 y b_calor=1,5 (datos exactos)',
          beta is not None and abs(beta[0] - 0.3) < 0.02 and abs(beta[1] - 1.5) < 0.02 and n == 133)
    # A2: acotado
    prog2 = {d: 22 + 6.0 * max(0, temp[d] - 22) for d in temp}
    check('un coeficiente fuera de rango se acota (6,0 -> 4,0)', gf.fit_beta_temperatura(prog2, temp)[0][1] == 4.0)
    prog3 = {d: 22 - 2.0 * max(0, temp[d] - 22) for d in temp}
    check('un coeficiente de calor negativo se acota a 0', gf.fit_beta_temperatura(prog3, temp)[0][1] == 0.0)
    # A3: pocos datos
    chico = {d: prog[d] for d in list(prog)[:20]}
    check('con pocos pares devuelve None', gf.fit_beta_temperatura(chico, temp)[0] is None)

    # A4: formula exacta con coeficientes fijos
    W = date(2026, 11, 2)                       # semana base (lunes)
    programa = {W + timedelta(days=i): 26.0 for i in range(7)}
    cerrado = {W - timedelta(days=7) + timedelta(days=i): 24.0 for i in range(7)}
    tobs = {}
    for i in range(7):
        tobs[W + timedelta(days=i)] = 20.0       # semana base: 20 C (sin grados-calor ni frio)
        tobs[W - timedelta(days=7) + timedelta(days=i)] = 18.0
    daily = ([{'fecha': d.isoformat(), 'cammesa_gas_est': v} for d, v in programa.items()]
             + [{'fecha': d.isoformat(), 'cammesa_gas': v} for d, v in cerrado.items()]
             + [{'fecha': d.isoformat(), 'temp_prom_ba': v} for d, v in tobs.items()])
    fc = [{'fecha': '2026-11-09', 'usinas_est': 40.0, 'temp_prom': 26.0},    # lunes, calor
          {'fecha': '2026-11-10', 'usinas_est': 40.0, 'temp_prom': 10.0}]    # martes, frio
    est, info = gf.estimar_usinas_persistencia(fc, daily, {}, '2026-11-01', {}, alfa=0.7, beta=(-0.1, 1.0))
    # lunes: programa 26 + 1,0*(4-0) = 30 ; cerrado 24 + 1,0*4 = 28 ; 0,7*30 + 0,3*28 = 29,4
    check('formula (calor): 0,7*30 + 0,3*28 = 29,4', est['2026-11-09'] == (29.4, 'persistencia_temp'))
    # martes: frio 7 grados mas que base y 7 que cerrado: programa 26 - 0,1*7 = 25,3 ; cerrado 24 - 0,7 = 23,3 ; 24,7
    check('formula (frio): 0,7*25,3 + 0,3*23,3 = 24,7', est['2026-11-10'] == (24.7, 'persistencia_temp'))
    check('info del metodo: semana base y coeficientes fijos', info['semana_base'] == '2026-11-02' and info['beta_fuente'] == 'fijo'
          and info['dias_estimados'] == 2)
    # A5: sin cerrado de la semana previa -> solo el termino del programa
    daily_sc = [r for r in daily if 'cammesa_gas' not in r]
    est2, _ = gf.estimar_usinas_persistencia(fc, daily_sc, {}, '2026-11-01', {}, alfa=0.7, beta=(-0.1, 1.0))
    check('sin dato cerrado usa solo el programa (30,0) y lo marca', est2['2026-11-09'] == (30.0, 'persistencia_temp_sin_cerrado'))
    # A6: exclusiones
    est3, _ = gf.estimar_usinas_persistencia(fc, daily, {}, '2026-11-09', {}, alfa=0.7, beta=(-0.1, 1.0))
    check('no estima dias con dato real (<= ultimo dato real)', '2026-11-09' not in est3 and '2026-11-10' in est3)
    est4, _ = gf.estimar_usinas_persistencia(fc, daily, {}, '2026-11-01', {'2026-11-09': 28.0}, alfa=0.7, beta=(-0.1, 1.0))
    check('no estima dias que ya tienen programa semanal', '2026-11-09' not in est4)
    est5, _ = gf.estimar_usinas_persistencia([dict(f, temp_prom=None) for f in fc], daily, {}, '2026-11-01', {}, beta=(-0.1, 1.0))
    check('un dia sin temperatura pronosticada no se estima', est5 == {})
    est6, i6 = gf.estimar_usinas_persistencia(fc, [r for r in daily if 'cammesa_gas_est' not in r], {}, '2026-11-01', {})
    check('sin ninguna semana de programa completa no estima nada', est6 == {} and i6['semana_base'] is None)
    # A8: la semana base es la ultima COMPLETA
    parcial = daily + [{'fecha': '2026-11-09', 'cammesa_gas_est': 30.0}, {'fecha': '2026-11-10', 'cammesa_gas_est': 30.0}]
    _, i8 = gf.estimar_usinas_persistencia([], parcial, {}, '2026-11-01', {}, beta=(0, 1))
    check('semana base = ultima semana con los 7 dias (ignora la incompleta)', i8['semana_base'] == '2026-11-02')
    # A9: historial + daily (daily gana)
    hist = {W + timedelta(days=i): 99.0 for i in range(7)}
    _, i9 = gf.estimar_usinas_persistencia([], daily, hist, '2026-11-01', {}, beta=(0, 1))
    est9, _ = gf.estimar_usinas_persistencia(fc, daily, hist, '2026-11-01', {}, alfa=1.0, beta=(0, 0))
    check('si daily.json y el historial difieren, manda daily.json', est9['2026-11-09'][0] == 26.0)
    # A10: temperatura del forecast para los dias futuros de la semana base
    daily_sin_t = [r for r in daily if 'temp_prom_ba' not in r or r['fecha'] < '2026-11-03']
    fc2 = [{'fecha': '2026-11-03', 'usinas_est': 1.0, 'temp_prom': 21.0}, {'fecha': '2026-11-10', 'usinas_est': 40.0, 'temp_prom': 26.0}]
    est10, _ = gf.estimar_usinas_persistencia(fc2, daily_sin_t, {}, '2026-11-01', {'2026-11-03': 1.0}, alfa=1.0, beta=(0, 1.0))
    # martes 10/11: base = martes 3/11, sin temp observada: se usa la pronosticada (21) -> calor 0 ; d: calor 4 -> 26 + 4 = 30
    check('la temperatura del dia base (futuro) sale del pronostico', est10.get('2026-11-10') == (30.0, 'persistencia_temp_sin_cerrado'))

    # A11: precedencia del anclaje y totales
    f = [{'fecha': '2026-11-02', 'usinas_est': 30.0, 'demanda_total_est': 120.0},
         {'fecha': '2026-11-03', 'usinas_est': 31.0, 'demanda_total_est': 121.0},
         {'fecha': '2026-11-09', 'usinas_est': 45.0, 'demanda_total_est': 140.0},
         {'fecha': '2026-11-10', 'usinas_est': 44.0, 'demanda_total_est': 139.0},
         {'fecha': '2026-11-11', 'usinas_est': None, 'demanda_total_est': None}]
    antes = [dict(x) for x in f]
    info = gf.anchor_usinas_to_weekly(f, '2026-11-01', {'2026-11-02': 26.0, '2026-11-03': 27.5},
                                      {'2026-11-09': (29.4, 'persistencia_temp')})
    check('precedencia: programa > persistencia > modelo con ancla',
          f[0]['usinas_fuente'] == 'programa_semanal' and f[0]['usinas_est'] == 26.0
          and f[2]['usinas_fuente'] == 'persistencia_temp' and f[2]['usinas_est'] == 29.4
          and f[3]['usinas_fuente'] == 'modelo_ajustado' and f[3]['usinas_est'] == 40.5)
    check('usinas_est_ancla conserva lo que daba el metodo anterior (modelo + sesgo)',
          f[2]['usinas_est_ancla'] == 41.5 and f[3]['usinas_est_ancla'] == 40.5 and f[0]['usinas_est_ancla'] == 26.0)
    check('el total cambia lo mismo que usinas',
          all(cerca(x['demanda_total_est'] - a['demanda_total_est'], x['usinas_est'] - a['usinas_est']) for x, a in zip(f[:4], antes[:4])))
    check('fila sin usinas: fuente None y mismas claves', f[4]['usinas_fuente'] is None and set(f[4]) == set(f[0]))
    check('el resumen cuenta dias de programa y de persistencia', info['dias_programa_semanal'] == 2 and info['dias_persistencia'] == 1)

    # A12: registro de seguimiento
    tmp = Path(tempfile.mkdtemp())
    log = str(tmp / 'seg.csv')
    futuro = [{'fecha': '2026-11-02', 'usinas_est': 26.0, 'usinas_fuente': 'programa_semanal', 'usinas_est_modelo': 30.0,
               'usinas_est_ancla': 26.0, 'temp_prom': 21.0},
              {'fecha': '2026-11-09', 'usinas_est': 29.4, 'usinas_fuente': 'persistencia_temp', 'usinas_est_modelo': 45.0,
               'usinas_est_ancla': 41.5, 'temp_prom': 26.0}]
    n1 = gf.actualizar_seguimiento(log, '2026-11-02', futuro, {'2026-11-02': 26.0}, '2026-11-01')
    n2 = gf.actualizar_seguimiento(log, '2026-11-02', futuro, {'2026-11-02': 26.0}, '2026-11-01')
    n3 = gf.actualizar_seguimiento(log, '2026-11-03', futuro, {'2026-11-02': 26.0}, '2026-11-01')
    filas = list(csv.DictReader(open(log, encoding='utf-8')))
    check('seguimiento: una corrida del mismo dia reemplaza (2 filas), otro dia agrega (4)', (n1, n2, n3) == (2, 2, 4) and len(filas) == 4)
    check('seguimiento: guarda estimado, fuente, regresion, ancla y el programa de CAMMESA',
          filas[0]['emitido'] == '2026-11-02' and filas[0]['programa_cammesa'] == '26.0' and filas[1]['programa_cammesa'] == ''
          and filas[1]['fuente'] == 'persistencia_temp' and filas[1]['usinas_regresion'] == '45.0' and filas[1]['usinas_ancla'] == '41.5')
    n4 = gf.actualizar_seguimiento(log, '2028-01-01', futuro, {}, '2026-11-01')
    check('seguimiento: descarta lo emitido hace mas de 540 dias', n4 == 2)
    sin_real = [dict(futuro[0], fecha='2026-10-30')]
    n5 = gf.actualizar_seguimiento(str(tmp / 'otro.csv'), '2026-11-02', sin_real, {}, '2026-11-01')
    check('seguimiento: no registra dias que ya tienen dato real', n5 == 0)
    # A13: lectura del historial
    h = tmp / 'h.csv'
    h.write_text('fecha,gas_total\n2026-10-19,29798\n2026-10-20,\nmala,1\n2026-10-21,27018\n', encoding='utf-8')
    got = gf.cargar_programa_historial(str(h))
    check('historial: convierte dam3 a MMm3 y salta filas vacias o invalidas',
          got == {date(2026, 10, 19): 29.798, date(2026, 10, 21): 27.018} and gf.cargar_programa_historial(str(tmp / 'no.csv')) == {})
    shutil.rmtree(tmp, ignore_errors=True)


# =========================== PARTE B: corrida completa ===========================
def T_obs(d):
    return 20.0 + 6.0 * math.sin(d.toordinal() / 6.0)


def armar(raiz, con_daily=True, con_hist=True, con_temp_daily=True, programa_dias=7):
    r = Path(raiz)
    (r / 'scripts').mkdir(parents=True)
    (r / 'public/data').mkdir(parents=True)
    shutil.copy(SCRIPTS / 'generate_forecast.py', r / 'scripts/generate_forecast.py')
    (r / 'scripts/_meta.py').write_text('''
import csv, json, os
def write_json(path, data, source=None, source_date=None):
    json.dump({"generated_at":"t","source":source,"source_date":source_date,"data":data}, open(path,"w",encoding="utf-8"), ensure_ascii=False)
def json_to_csv_path(p): return p[:-5]+".csv"
def write_csv(path, rows, fieldnames=None):
    fn = fieldnames or list(rows[0].keys())
    with open(path,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f, fieldnames=fn); w.writeheader(); w.writerows(rows)
''', encoding='utf-8')
    env = lambda data: {'generated_at': 't', 'source': 't', 'source_date': None, 'data': data}
    random.seed(7)
    rds = []
    for i in range(600):
        d = date(2025, 3, 1) + timedelta(days=i)
        t = 17 + 8 * math.sin((d.timetuple().tm_yday - 100) / 365 * 2 * math.pi * -1) + random.gauss(0, 1.5)
        wk = -3 if d.weekday() >= 5 else 0
        rds.append({'fecha': d.isoformat(), 'temperatura_ba': {'tm': round(t, 1)},
                    'consumos': {'prioritaria': {'programa': round(max(5, 45 - 1.8 * t + random.gauss(0, 1.5)), 1)},
                                 'industria': {'programa': round(30 + 0.1 * t + wk + random.gauss(0, 1), 1)},
                                 'gnc': {'programa': round(6 + random.gauss(0, .3), 1)},
                                 'combustible': {'programa': round(2 + random.gauss(0, .2), 1)},
                                 'cammesa': {'programa': round(max(5, 18 + 0.5 * t + wk + random.gauss(0, 2)), 1)}},
                    'exportaciones': {'tgn': {'vol_exportar': 3.0}, 'tgs': {'vol_exportar': 4.0}},
                    'consumo_total_estimado': round(120 + random.gauss(0, 5), 1)})
    (r / 'public/data/enargas.json').write_text(json.dumps(env(rds)))
    temps = [23, 24, 26, 27, 28, 25, 22, 24, 29, 30, 27, 25, 23, 21]
    fc = [{'fecha': (date(2026, 11, 2) + timedelta(days=i)).isoformat(), 'temp_prom': float(temps[i]), 'temp_max': 30, 'temp_min': 15}
          for i in range(14)]
    (r / 'public/data/weather.json').write_text(json.dumps(env({'forecast': fc})))
    gas_prog = lambda d: 22 + 1.4 * max(0, T_obs(d) - 22)           # el "programa" depende solo de la temperatura
    hist_ini = date(2026, 5, 4)
    if con_hist:
        (r / 'raw/cammesa_psem_hist').mkdir(parents=True)
        with open(r / 'raw/cammesa_psem_hist/psem_historial.csv', 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(['fecha', 'gas_total'])
            for i in range((date(2026, 10, 26) - hist_ini).days):
                d = hist_ini + timedelta(days=i)
                w.writerow([d.isoformat(), round(gas_prog(d) * 1000, 1)])
    if con_daily:
        daily = []
        for i in range((date(2026, 11, 16) - hist_ini).days):
            d = hist_ini + timedelta(days=i)
            row = {'fecha': d.isoformat(), 'demanda_total': 110.0 if d <= date(2026, 11, 1) else None,
                   'cammesa_gas': round(gas_prog(d) + 1.0, 3) if d <= date(2026, 11, 1) else None, 'cammesa_gas_est': None,
                   'temp_prom_ba': round(T_obs(d), 2) if (con_temp_daily and d <= date(2026, 11, 2)) else None}
            if date(2026, 10, 26) <= d < date(2026, 10, 26) + timedelta(days=14) and (d - date(2026, 10, 26)).days < 14:
                if (d - date(2026, 10, 26)).days < 7 + programa_dias:
                    row['cammesa_gas_est'] = round(gas_prog(d), 3)
            daily.append(row)
        (r / 'public/data/daily.json').write_text(json.dumps(env(daily)))
    return r


def correr(r):
    p = subprocess.run([sys.executable, str(r / 'scripts/generate_forecast.py')], capture_output=True, text=True, cwd=str(r))
    return p.returncode, p.stdout + p.stderr


def leer(r):
    j = json.loads((r / 'public/data/demand_forecast.json').read_text(encoding='utf-8'))['data']
    return {f['fecha']: f for f in j['forecast']}, j['regression']


def parte_b():
    print('B. corrida completa con datos sinteticos')
    tmp = Path(tempfile.mkdtemp())
    r = armar(tmp / 'b1')
    rc, out = correr(r)
    check('la corrida termina bien', rc == 0)
    por, reg = leer(r)
    met = reg['usinas_metodo']
    check('coeficientes ajustados con el historial (b_calor ~ 1,4; 133+ pares)',
          met['beta_fuente'] == 'historial' and abs(met['beta_calor'] - 1.4) < 0.05 and met['pares_beta'] >= 28)
    check('semana base = 2/11 y 7 dias estimados (9/11 a 15/11)', met['semana_base'] == '2026-11-02' and met['dias_estimados'] == 7)
    programa = {date(2026, 10, 26) + timedelta(days=i): 22 + 1.4 * max(0, T_obs(date(2026, 10, 26) + timedelta(days=i)) - 22) for i in range(14)}
    check('dias 2/11 a 8/11: valor del programa de CAMMESA',
          all(por[(date(2026, 11, 2) + timedelta(days=i)).isoformat()]['usinas_fuente'] == 'programa_semanal'
              and cerca(por[(date(2026, 11, 2) + timedelta(days=i)).isoformat()]['usinas_est'], programa[date(2026, 11, 2) + timedelta(days=i)], 0.002)
              for i in range(7)))
    # recalculo independiente de los dias 9/11..15/11 con los datos de entrada
    temps = {f['fecha']: f['temp_prom'] for f in json.loads((r / 'public/data/weather.json').read_text())['data']['forecast']}
    daily = {x['fecha']: x for x in json.loads((r / 'public/data/daily.json').read_text())['data']}
    bfr, bca = met['beta_frio'], met['beta_calor']
    g = lambda t: (max(0, 17 - t), max(0, t - 22))
    tmp_t = lambda d: daily[d.isoformat()]['temp_prom_ba'] if daily[d.isoformat()]['temp_prom_ba'] is not None else temps[d.isoformat()]
    bien = True
    for i in range(7):
        d = date(2026, 11, 9) + timedelta(days=i)
        b, c = date(2026, 11, 2) + timedelta(days=i), date(2026, 10, 26) + timedelta(days=i)
        gd, gb, gc = g(temps[d.isoformat()]), g(tmp_t(b)), g(tmp_t(c))
        pb = daily[b.isoformat()]['cammesa_gas_est']
        rc_ = daily[c.isoformat()]['cammesa_gas']
        est = 0.7 * (pb + bfr * (gd[0] - gb[0]) + bca * (gd[1] - gb[1])) + 0.3 * (rc_ + bfr * (gd[0] - gc[0]) + bca * (gd[1] - gc[1]))
        f = por[d.isoformat()]
        bien &= f['usinas_fuente'] == 'persistencia_temp' and cerca(f['usinas_est'], est, 0.06)
    check('dias 9/11 a 15/11: coinciden con la formula recalculada de forma independiente', bien)
    check('se conserva la regresion y el ancla anterior en cada fila',
          all(f['usinas_est_modelo'] is not None and f['usinas_est_ancla'] is not None for k, f in por.items() if k >= '2026-11-02'))
    seg = list(csv.DictReader(open(r / 'public/data/usinas_seguimiento.csv', encoding='utf-8')))
    check('registro de seguimiento: 14 filas (2/11 a 15/11) con la fuente de cada dia',
          len(seg) == 14 and {x['fuente'] for x in seg} == {'programa_semanal', 'persistencia_temp'})
    rc, _ = correr(r)
    seg2 = list(csv.DictReader(open(r / 'public/data/usinas_seguimiento.csv', encoding='utf-8')))
    check('una segunda corrida del mismo dia no duplica el registro', rc == 0 and len(seg2) == 14)
    for x in seg2:
        x['emitido'] = (date.fromisoformat(x['emitido']) - timedelta(days=1)).isoformat()
    with open(r / 'public/data/usinas_seguimiento.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(seg2[0].keys()), lineterminator='\n')
        w.writeheader()
        w.writerows(seg2)
    correr(r)
    seg3 = list(csv.DictReader(open(r / 'public/data/usinas_seguimiento.csv', encoding='utf-8')))
    check('al dia siguiente se agrega sin perder lo anterior (28 filas)', len(seg3) == 28)
    # totales vs una corrida sin ancla
    r0 = armar(tmp / 'b0', con_daily=False, con_hist=False)
    correr(r0)
    por0, _ = leer(r0)
    ok_t = all(cerca(por[k]['demanda_total_est'] - por0[k]['demanda_total_est'], por[k]['usinas_est'] - por0[k]['usinas_est']) for k in por)
    check('demanda_total_est cambia exactamente lo que cambio usinas', ok_t)
    csvp = list(csv.DictReader(open(r / 'public/data/demand_forecast.csv', encoding='utf-8')))
    check('el CSV del forecast se escribe con las columnas nuevas', len(csvp) == 14 and 'usinas_fuente' in csvp[0] and 'usinas_est_ancla' in csvp[0])

    # --- respaldos
    r2 = armar(tmp / 'b2', con_hist=False)
    correr(r2)
    por2, reg2 = leer(r2)
    check('sin historial usa coeficientes por defecto (daily trae solo 14 dias de programa)',
          reg2['usinas_metodo']['beta_fuente'] == 'defecto' and por2['2026-11-10']['usinas_fuente'] == 'persistencia_temp')
    r3 = armar(tmp / 'b3', con_temp_daily=False)
    correr(r3)
    por3, reg3 = leer(r3)
    check('sin temperatura observada: usa el pronostico para la semana base y solo el programa (sin cerrado)',
          por3['2026-11-10']['usinas_fuente'] == 'persistencia_temp_sin_cerrado' and reg3['usinas_metodo']['beta_fuente'] == 'defecto')
    r4 = armar(tmp / 'b4', programa_dias=7)
    # programa incompleto: se le quitan 4 dias a la semana mas nueva Y a la anterior
    dj = json.loads((r4 / 'public/data/daily.json').read_text())
    for x in dj['data']:
        if x['fecha'] in ('2026-10-26', '2026-11-04'):
            x['cammesa_gas_est'] = None
    (r4 / 'public/data/daily.json').write_text(json.dumps(dj))
    correr(r4)
    por4, reg4 = leer(r4)
    check('sin ninguna semana de programa completa: vuelve al metodo anterior (modelo + ancla)',
          reg4['usinas_metodo']['semana_base'] is None and por4['2026-11-10']['usinas_fuente'] in ('modelo_ajustado', 'modelo'))
    r5 = armar(tmp / 'b5', con_daily=False, con_hist=False)
    correr(r5)
    por5, reg5 = leer(r5)
    check('sin daily.json: usa el modelo tal cual', all(f['usinas_fuente'] == 'modelo' for f in por5.values()) and reg5['usinas_metodo'] is None)
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    gf = importar()
    parte_a(gf)
    parte_b()
    print('\nRESULTADO: %d OK, %d FAIL' % (OK, FAIL))
    sys.exit(1 if FAIL else 0)
