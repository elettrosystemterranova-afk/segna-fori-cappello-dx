t=open('src/tpl.html').read();core=open('src/core.js').read();data=open('src/data.json').read()
t=t.replace('/*CORE*/',core).replace('/*DATA*/',data)
open('docs/index.html','w').write(t);print(len(t))
