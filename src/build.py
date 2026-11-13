t=open('src/tpl.html',encoding='utf-8').read();core=open('src/core.js',encoding='utf-8').read();data=open('src/data.json',encoding='utf-8').read();prova=open('src/prova_misura.json',encoding='utf-8').read();remoto=open('src/remoto.js',encoding='utf-8').read()
t=t.replace('/*CORE*/',core).replace('/*DATA*/',data).replace('/*PROVA*/',prova).replace('/*REMOTO*/',remoto)
open('docs/index.html','w',encoding='utf-8').write(t);print(len(t))
