#!/usr/bin/env python3
"""
Valida contra el gas CERRADO (lo realmente despachado) el programa semanal de CAMMESA y distintos
predictores del gas de usinas, simulando que se predice la semana SIGUIENTE al ultimo programa.

Entradas:
  --csv    raw/cammesa_psem_hist/psem_historial.csv   (historial de programas; sale de build_psem_history.py)
  --excel  Resumen_combustibles_Cammesa_Real.xlsx     (serie cerrada diaria, gas en dam3; 1/1/2024 en adelante)
  --ppo    public/data/cammesa_ppo.json               (serie cerrada reciente, gas en MMm3)
La serie cerrada se arma con el Excel y el PPO (donde se superponen son iguales).

Uso:
    python scripts/validar_contra_cerrado.py --csv raw/cammesa_psem_hist/psem_historial.csv \
        --excel Resumen_combustibles_Cammesa_Real.xlsx --ppo public/data/cammesa_ppo.json

Predictores (todos para la semana W+1, con informacion hasta la semana W):
  P1 programa de W+1 (cota: en la practica todavia no existe)   P2 programa de W, mismo dia de la semana
  P3 cerrado de W-1, mismo dia                                   P4 programa de W + correccion por temperatura
  P5 programa de W calibrado con el cociente cerrado/programa    P6 cerrado de W-1 + correccion por temperatura
y el enfoque actual del grafico: regresion lineal en temperatura + ancla en el ultimo dia programado.
"""
import argparse
_ap = argparse.ArgumentParser(description="Valida modelos de gas para usinas contra el gas cerrado.")
_ap.add_argument("--csv", required=True); _ap.add_argument("--excel", required=True); _ap.add_argument("--ppo", required=True)
ARGS = _ap.parse_args()
import csv, json, statistics as st, sys
from datetime import date, timedelta
import numpy as np, openpyxl
# ---- serie cerrada (MMm3/d): Excel 2024-01-01..2026-02-28 + PPO 2026-01-20..2026-11-01 (idénticos donde se superponen)
real={}
ws=openpyxl.load_workbook(ARGS.excel,data_only=True).active
for r in ws.iter_rows(min_row=2,values_only=True):
    if r[0] and r[1] is not None: real[(r[0].date() if hasattr(r[0],'date') else r[0])]=r[1]/1000.0
for r in json.load(open(ARGS.ppo,encoding='utf-8'))['data']: real[date.fromisoformat(r['fecha'])]=r['gas_mmm3']
print('serie cerrada combinada:',len(real),'días',min(real),'->',max(real))
# ---- programas (CSV)
P={}
for r in csv.DictReader(open(ARGS.csv,encoding='utf-8')):
    d=date.fromisoformat(r['fecha']); P[d]=dict(gas=float(r['gas_total'])/1000.0,t=float(r['temp_cammesa']) if r['temp_cammesa'] else np.nan,prog=r['programa'])
dias=sorted(d for d in P if d in real)
print('días con programa Y dato cerrado:',len(dias),dias[0],'->',dias[-1])
e=np.array([P[d]['gas']-real[d] for d in dias]); rr=np.array([real[d] for d in dias])
print(f'\nPROGRAMA vs CERRADO (todos los días): MAE={np.mean(np.abs(e)):.2f}  RMSE={np.sqrt(np.mean(e**2)):.2f}  sesgo medio={np.mean(e):+.2f}  error relativo medio={np.mean(np.abs(e)/rr)*100:.1f}%')
print('  por trimestre (sesgo MAE):',end=' ')
for q,(a,b) in {'Nov25':(date(2025,11,1),date(2025,12,31)),'Feb-Abr26':(date(2026,2,1),date(2026,4,30)),'May-Jul26':(date(2026,5,1),date(2026,7,31)),'Ago-Nov26':(date(2026,8,1),date(2026,11,1))}.items():
    sel=[i for i,d in enumerate(dias) if a<=d<=b]
    if sel: print(f'{q}: {np.mean(e[sel]):+.2f}/{np.mean(np.abs(e[sel])):.2f}',end='  ')
print()
# ---- predecir la semana W+1 (con info hasta la semana W) y medir contra el CERRADO de W+1
def lunes(d): return d-timedelta(days=d.weekday())
semanas=sorted({lunes(d) for d in P}); porsem={s:[d for d in sorted(P) if lunes(d)==s] for s in semanas}
def mismo(sem,dow): return next((d for d in porsem.get(sem,[]) if d.weekday()==dow),None)
def hdd(t): return np.array([max(0,17-t),max(0,t-22)])
res={k:[] for k in ('P1 programa de W+1 (no disponible aún: es la cota)','P2 programa de W, mismo día (persistencia)','P3 cerrado de W-1, mismo día','P4 programa de W + corrección por temperatura','P5 programa de W calibrado con ratio cerrado/programa de W-1','P6 cerrado de W-1 + corrección por temperatura')}
keys=list(res)
# coeficientes de temperatura (histórico de cambios semana a semana del programa)
pares=[]
for s in semanas:
    for d in porsem[s]:
        z=mismo(s-timedelta(days=7),d.weekday())
        if z is not None: pares.append((P[d]['gas']-P[z]['gas'],hdd(P[d]['t'])-hdd(P[z]['t'])))
X=np.array([p[1] for p in pares]); y=np.array([p[0] for p in pares]); beta=np.linalg.solve(X.T@X+1e-3*np.eye(2),X.T@y); print(f'\ncoeficientes de temperatura (sobre cambios del programa): {beta[0]:+.2f} por °C bajo 17, {beta[1]:+.2f} por °C sobre 22')
n=0
for s in semanas:
    w, wm1 = s-timedelta(days=7), s-timedelta(days=14)
    if w not in porsem or wm1 not in porsem: continue
    obj=[d for d in porsem[s] if d in real]
    if len(obj)<7: continue
    # ratio de calibración: cerrado/programa de W-1 (semana ya cerrada al momento de predecir)
    cw=[d for d in porsem[wm1] if d in real]
    if len(cw)<7: continue
    k=sum(real[d] for d in cw)/sum(P[d]['gas'] for d in cw); n+=1
    for d in obj:
        t=real[d]; a=mismo(w,d.weekday()); b=mismo(wm1,d.weekday())
        res[keys[0]].append(P[d]['gas']-t); res[keys[1]].append(P[a]['gas']-t); 
        if b in real: res[keys[2]].append(real[b]-t)
        res[keys[3]].append(P[a]['gas']+beta@(hdd(P[d]['t'])-hdd(P[a]['t']))-t)
        res[keys[4]].append(P[a]['gas']*k-t)
        if b in real: res[keys[5]].append(real[b]+beta@(hdd(P[d]['t'])-hdd(P[b]['t']))-t)
print(f'\nERROR vs CERRADO al predecir la semana siguiente ({n} semanas con todo disponible):')
for k_,v in res.items():
    v=np.array(v); print(f'  {k_:62s} MAE={np.mean(np.abs(v)):5.2f}  RMSE={np.sqrt(np.mean(v**2)):5.2f}  sesgo={np.mean(v):+5.2f}  (n={len(v)})')

# ---- enfoque actual (regresión lineal en temperatura + día + ancla en el último día programado), entrenado con lo CERRADO
def dowc(w): 
    v=np.zeros(6); 
    if w>=1: v[w-1]=1
    return v
def feat(d,modo): 
    t=P[d]['t']; base=[1,t] if modo=='lineal' else [1,max(0,17-t),max(0,t-22)]
    return np.array(base+list(dowc(d.weekday())))
def evaluar_modelo(modo,vida,ancla):
    err=[]; 
    for s in semanas:
        w=s-timedelta(days=7)
        if w not in porsem: continue
        obj=[d for d in porsem[s] if d in real]
        if len(obj)<7: continue
        hist=[d for d in P if d<=porsem[w][-1] and d in real and not np.isnan(P[d]['t'])]
        if len(hist)<56: continue
        Xh=np.array([feat(d,modo) for d in hist]); yh=np.array([real[d] for d in hist])
        wt=np.array([0.5**(((w-lunes(d)).days/7)/vida) for d in hist]) if vida else np.ones(len(hist))
        W_=np.sqrt(wt)[:,None]; b=np.linalg.solve((Xh*W_).T@(Xh*W_)+1e-6*np.eye(Xh.shape[1]),(Xh*W_).T@(yh*W_[:,0]))
        sesgo=(P[porsem[w][-1]]['gas']-feat(porsem[w][-1],modo)@b) if ancla else 0.0
        err+=[feat(d,modo)@b+sesgo-real[d] for d in obj]
    e=np.array(err); return len(e)//7,np.mean(np.abs(e)),np.sqrt(np.mean(e**2)),np.mean(e)
print('\nEnfoque ACTUAL del gráfico (regresión + ancla), entrenado con lo CERRADO, mismo criterio (predice la semana siguiente):')
for nombre,modo,vida,anc in [('A  lineal en temperatura, sin ponderar, con ancla  (≈ gráfico actual)','lineal',None,True),
                             ('B  HDD/CDD, sin ponderar, con ancla','hdd',None,True),
                             ('B  HDD/CDD, vida media 4 semanas, con ancla','hdd',4,True),
                             ('B  HDD/CDD, vida media 2 semanas, con ancla','hdd',2,True)]:
    n,mae,rmse,sesgo=evaluar_modelo(modo,vida,anc); print(f'  {nombre:68s} MAE={mae:5.2f} RMSE={rmse:5.2f} sesgo={sesgo:+5.2f} (semanas={n})')
