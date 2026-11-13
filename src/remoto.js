// ===== secondo telefono (telecomando) =====
// Collegamento diretto tra i due telefoni (WebRTC) SENZA server: nessun STUN/TURN (iceServers vuoto),
// quindi funziona sulla stessa rete (hotspot del telefono principale).
// 1) Pairing: i codici di collegamento (offerta e risposta) si scambiano con un QR o copia/incolla.
//    Contengono solo i canali dati (codice corto, QR facile da leggere).
// 2) Appena collegati, il principale aggiunge il VIDEO (flusso WebRTC dello schermo con i fori) e lo negozia
//    sul canale già aperto (nessun altro QR). Se il video non parte entro pochi secondi, ripiego: immagini JPEG.
// 3) Il telecomando mostra una schermata sua (selezione sagoma e fori, un solo video, pulsanti): riceve lo
//    stato dal principale e gli manda i comandi. Principale = fotocamera + tutti i calcoli.
(function(){
var $=function(id){return document.getElementById(id);};
var S={ruolo:null,pc:null,dcV:null,dcC:null,sessione:'',codice:'',scan:null,scanTimer:0,tick:0,stTick:0,frames:0,sent:0,q:0.72,enc:false,ultimo:null,dis:false,log:[],tmp:null,to:0,toVideo:0,snd:null,vst:null,stJson:'',lock:0,chipsKey:'',wake:null,fallback:false};
var caricate={};
var MAXMSG=200000; // dimensione massima di un fotogramma JPEG di ripiego (byte)

function log(t){
  var d=new Date(),h=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2);
  S.log.push(h+' '+t);if(S.log.length>40)S.log.shift();
  var x=S.log.slice(-14).join('\n');['rLog','rLog2'].forEach(function(i){var el=$(i);if(el)el.textContent=x;});
}
function carica(src){
  return new Promise(function(ok,ko){
    if(caricate[src]){ok();return;}
    var s=document.createElement('script');s.src=src;
    s.onload=function(){caricate[src]=1;ok();};
    s.onerror=function(){ko(new Error('Libreria non caricata ('+src+'). Serve aver aperto la pagina almeno una volta con internet.'));};
    document.head.appendChild(s);
  });
}

// ---- codifica del codice di collegamento: testo -> (compresso) -> base64 ----
function b64u(b){var s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64u(t){t=t.replace(/-/g,'+').replace(/_/g,'/');while(t.length%4)t+='=';var s=atob(t),b=new Uint8Array(s.length);for(var i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
function leggiTutto(readable){return new Response(readable).arrayBuffer().then(function(a){return new Uint8Array(a);});}
function comprimi(testo){
  var raw=new TextEncoder().encode(testo);
  if(!window.CompressionStream)return Promise.resolve('r'+b64u(raw));
  var cs=new CompressionStream('deflate-raw'),w=cs.writable.getWriter();w.write(raw);w.close();
  return leggiTutto(cs.readable).then(function(b){return 'z'+b64u(b);});
}
function decomprimi(codice){
  codice=codice.replace(/\s+/g,'');var tipo=codice.charAt(0),b;
  try{b=unb64u(codice.slice(1));}catch(e){return Promise.reject(new Error('Codice non valido.'));}
  if(tipo==='r')return Promise.resolve(new TextDecoder().decode(b));
  if(tipo!=='z'||!window.DecompressionStream)return Promise.reject(new Error('Codice non valido (o questo telefono è troppo vecchio).'));
  var ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();w.write(b);w.close();
  return leggiTutto(ds.readable).then(function(x){return new TextDecoder().decode(x);});
}
// 4 caratteri calcolati dall'offerta: appaiono su entrambi i telefoni per riconoscere la coppia giusta
function sigla(testo){var h=5381;for(var i=0;i<testo.length;i++)h=((h<<5)+h+testo.charCodeAt(i))>>>0;return h.toString(36).toUpperCase().slice(-4).padStart(4,'0');}
// toglie i candidati con indirizzo IPv6 (contengono ':'): sull'hotspot non servono e allungano il codice
function soloIPv4(sdp){
  return sdp.split('\n').map(function(r){return r.replace(/\r$/,'');}).filter(function(r){
    if(r.indexOf('a=candidate:')!==0)return true;
    var a=r.split(' ')[4]||'';return a.indexOf(':')<0;
  }).join('\r\n');
}
function indirizzi(sdp){ // elenco leggibile dei candidati di un SDP, per i dettagli tecnici
  var out=[];sdp.split('\n').forEach(function(r){
    r=r.trim();if(r.indexOf('a=candidate:')!==0)return;var p=r.split(' '),i=p.indexOf('typ');
    out.push(p[4]+':'+p[5]+' ('+(i>0?p[i+1]:'?')+')');});
  return out;
}

// ---- WebRTC ----
function nuovoPc(){
  var pc=new RTCPeerConnection({iceServers:[]});
  pc.onconnectionstatechange=function(){
    var st=pc.connectionState;log('collegamento: '+st);
    if(S.pc!==pc)return;
    if(st==='failed')fallito();
    else if(st==='disconnected'||st==='closed')stato('Disconnesso.');
  };
  pc.oniceconnectionstatechange=function(){log('ICE: '+pc.iceConnectionState);};
  pc.onicegatheringstatechange=function(){log('ricerca indirizzi: '+pc.iceGatheringState);};
  pc.onsignalingstatechange=function(){log('segnalazione: '+pc.signalingState);};
  return pc;
}
function fallito(){
  stato('❌ Collegamento non riuscito.');
  passo('I due telefoni non riescono a parlarsi. Controlla che il telecomando sia collegato al Wi-Fi (hotspot) del telefono principale e che nessuno dei due abbia la VPN o il "risparmio dati" attivi. Poi premi Scollega e riprova. In "Dettagli tecnici" vedi gli indirizzi trovati.');
  mostra('rStop',true);
}
function attendiIce(pc){
  return new Promise(function(ok){
    if(pc.iceGatheringState==='complete'){ok();return;}
    var fatto=false;function fine(){if(!fatto){fatto=true;ok();}}
    pc.addEventListener('icegatheringstatechange',function(){if(pc.iceGatheringState==='complete')fine();});
    setTimeout(fine,3500);
  });
}
function invia(m){var c=S.dcC;if(c&&c.readyState==='open'){try{c.send(JSON.stringify(m));return true;}catch(e){}}return false;}
function creaCanali(pc){
  // canali "concordati": stessi id sui due telefoni, senza altra trattativa. 0 = immagini di ripiego, 1 = messaggi
  var v=pc.createDataChannel('v',{negotiated:true,id:0}),c=pc.createDataChannel('c',{negotiated:true,id:1});
  v.binaryType='arraybuffer';S.dcV=v;S.dcC=c;
  v.onclose=function(){log('canale immagini chiuso');};
  v.onmessage=function(e){
    if(S.ruolo!=='R'||typeof e.data==='string')return;
    S.frames++;S.ultimo=e.data;
    if(S.frames===1){S.fallback=true;$('rVideo').style.display='none';$('rFrame').style.display='block';log('ricevo immagini JPEG (ripiego)');}
    if(!S.dis){S.dis=true;requestAnimationFrame(mostraFrame);}
  };
  c.onopen=function(){log('canale messaggi aperto');collegato();invia({t:'ciao',r:S.ruolo});};
  c.onclose=function(){log('canale messaggi chiuso');};
  c.onmessage=function(e){var m;try{m=JSON.parse(e.data);}catch(x){return;}gestisci(m);};
}

// ---- video vero: il principale lo aggiunge dopo il collegamento (rinegoziazione sul canale aperto) ----
function avviaVideo(){
  var pc=S.pc;if(!pc||S.snd)return;
  try{
    S.vst=cv.captureStream(30);var tr=S.vst.getVideoTracks()[0];
    try{tr.contentHint='detail';}catch(e){}
    S.snd=pc.addTrack(tr,S.vst);log('video: traccia aggiunta, preparo l\'offerta');
    pc.createOffer().then(function(o){return pc.setLocalDescription(o);}).then(function(){invia({t:'offer',sdp:pc.localDescription.sdp});log('video: offerta inviata');})
      .catch(function(e){log('video: errore offerta '+(e&&e.message||e));});
  }catch(e){log('video: non posso avviarlo ('+(e&&e.message||e)+')');}
  // tiene vivo il flusso anche a schermo fermo (il canvas manda un fotogramma solo quando cambia)
  clearInterval(S.tick);S.tick=setInterval(function(){if(!live&&typeof draw==='function')draw();},100);
}
function parametriVideo(){
  try{var pr=S.snd.getParameters();if(!pr.encodings||!pr.encodings.length)pr.encodings=[{}];
    pr.encodings[0].maxBitrate=4000000;pr.encodings[0].maxFramerate=30;pr.degradationPreference='maintain-resolution';
    S.snd.setParameters(pr).catch(function(){});}catch(e){}
}
function ricevi(sdp){ // telecomando: il principale propone il video
  var pc=S.pc;log('video: offerta ricevuta');
  pc.setRemoteDescription({type:'offer',sdp:sdp}).then(function(){return pc.createAnswer();}).then(function(a){return pc.setLocalDescription(a);})
    .then(function(){invia({t:'answer',sdp:pc.localDescription.sdp});log('video: risposta inviata');})
    .catch(function(e){log('video: errore risposta '+(e&&e.message||e));});
}
function controllaVideo(){ // se dopo qualche secondo il video non scorre, chiede al principale le immagini di ripiego
  clearTimeout(S.toVideo);
  S.toVideo=setTimeout(function(){
    var v=$('rVideo');
    if(S.ruolo==='R'&&!S.fallback&&!(v.videoWidth>0&&v.currentTime>0)){log('video non partito: chiedo le immagini JPEG');invia({t:'nov'});}
  },9000);
}
function gestisci(m){
  if(!m||!m.t)return;
  if(m.t==='offer'&&S.ruolo==='R')ricevi(m.sdp);
  else if(m.t==='answer'&&S.ruolo==='P'&&S.pc){S.pc.setRemoteDescription({type:'answer',sdp:m.sdp}).then(function(){log('video: collegato');parametriVideo();}).catch(function(e){log('video: errore '+(e&&e.message||e));});}
  else if(m.t==='nov'&&S.ruolo==='P'){log('il telecomando non vede il video: invio JPEG');avviaInvio();}
  else if(m.t==='stato'&&S.ruolo==='R')applicaStato(m);
  else if(m.t==='cmd'&&S.ruolo==='P')eseguiCmd(m);
  if(typeof S.onmsg==='function')S.onmsg(m);
}

// ---- ripiego: immagini JPEG sul canale dati ----
function avviaInvio(){clearInterval(S.stJpg);S.stJpg=setInterval(inviaFrame,90);}
function inviaFrame(){
  var dc=S.dcV;if(!dc||dc.readyState!=='open'||S.enc||dc.bufferedAmount>250000)return;
  var w=Math.min(cv.width,1000),h=Math.max(1,Math.round(cv.height*w/cv.width)),sorg=cv;
  if(w<cv.width){S.tmp=S.tmp||document.createElement('canvas');S.tmp.width=w;S.tmp.height=h;S.tmp.getContext('2d').drawImage(cv,0,0,w,h);sorg=S.tmp;}
  S.enc=true;
  sorg.toBlob(function(b){
    if(!b){S.enc=false;return;}
    b.arrayBuffer().then(function(a){
      if(a.byteLength>MAXMSG){S.q=Math.max(0.35,S.q-0.08);}
      else{if(dc.readyState==='open'&&dc.bufferedAmount<250000){dc.send(a);S.sent++;}if(a.byteLength<90000&&S.q<0.8)S.q+=0.02;}
      S.enc=false;
    }).catch(function(){S.enc=false;});
  },'image/jpeg',S.q);
}
function mostraFrame(){
  S.dis=false;var d=S.ultimo;S.ultimo=null;if(!d)return;
  createImageBitmap(new Blob([d],{type:'image/jpeg'})).then(function(bm){
    var c=$('rFrame');if(c.width!==bm.width||c.height!==bm.height){c.width=bm.width;c.height=bm.height;}
    c.getContext('2d').drawImage(bm,0,0);if(bm.close)bm.close();
  }).catch(function(){});
}

// ---- stato (principale -> telecomando) e comandi (telecomando -> principale) ----
function statoPrincipale(){
  var t=cur(),d=done[t.id]||{};
  return {t:'stato',gr:grSel.value,pc:+pcSel.value,live:!!live,locked:!!(live&&live.locked),locking:!!(live&&live.locking),
    torch:!!(live&&!torchBtn.hidden),torchOn:!!(live&&live.torchOn),badge:[badge.className,badge.textContent],msg:msg.textContent,
    holes:t.holes.map(function(h,i){return [h[2],!!d[i]];}),sel:sel};
}
function inviaStato(){
  if(S.ruolo!=='P')return;var s=statoPrincipale(),j=JSON.stringify(s);
  if(j!==S.stJson&&invia(s))S.stJson=j;
}
function eseguiCmd(m){
  try{
    if(m.a==='gr'){if(gruppi.indexOf(m.v)>=0){grSel.value=m.v;grSel.onchange();}}
    else if(m.a==='pc'){var p=DATA[m.v];if(p){if(grSel.value!==p.grp){grSel.value=p.grp;fillPieces();}pcSel.value=String(m.v);pcSel.onchange();}}
    else if(m.a==='foro'){var b=document.querySelectorAll('#chips .chip')[m.v];if(b)b.click();}
    else if(m.a==='lock')lockBtn.click();
    else if(m.a==='live')liveBtn.click();
    else if(m.a==='torch')torchBtn.click();
    else if(m.a==='full')$('full').click();
  }catch(e){log('comando non eseguito: '+(e&&e.message||e));}
  S.stJson='';inviaStato();
}
function riempiGr(){
  var g=$('tGr');if(g.options.length)return;
  gruppi.forEach(function(x){var o=document.createElement('option');o.value=x;o.textContent=x;g.appendChild(o);});
}
function riempiPc(gr){
  var p=$('tPc');p.innerHTML='';p.dataset.gr=gr;
  DATA.forEach(function(x,i){if(x.grp!==gr)return;var o=document.createElement('option');o.value=i;
    o.textContent=x.t+' · '+x.holes.length+(x.holes.length===1?' foro':' fori');p.appendChild(o);});
}
function applicaStato(s){
  var g=$('tGr'),p=$('tPc');riempiGr();
  if(Date.now()-S.lock>1500){ // non disturba la scelta appena fatta sul telecomando
    if(g.value!==s.gr)g.value=s.gr;
    if(p.dataset.gr!==s.gr)riempiPc(s.gr);
    if(p.value!==String(s.pc))p.value=String(s.pc);
  }
  var key=JSON.stringify([s.pc,s.holes,s.sel]);
  if(key!==S.chipsKey){
    S.chipsKey=key;var box=$('tChips');box.innerHTML='';
    s.holes.forEach(function(h,i){
      var b=document.createElement('button');b.className='chip'+(h[1]?' done':'');b.textContent=h[0]+(h[1]?' ✓':'');
      if(i===s.sel)b.style.borderColor='#ff3df0';
      b.onclick=function(){invia({t:'cmd',a:'foro',v:i});};box.appendChild(b);});
  }
  var bd=$('rBadge');bd.className=s.badge[0];bd.textContent=s.badge[1];$('tMsg').textContent=s.msg;
  var L=$('tLive'),K=$('tLock'),T=$('tTorch');
  L.textContent=s.live?'Ferma video live':'Video live';L.className='big'+(s.live?' on':'');
  K.hidden=!s.live;K.textContent=s.locked?'🔓 Sblocca posa':'🔒 Blocca posa';K.className='big'+(s.locked?' on':'');K.disabled=!!s.locking;
  T.hidden=!s.torch;T.className='sec'+(s.torchOn?' on':'');
}

// ---- interfaccia ----
function mostra(el,on){$(el).hidden=!on;}
function passo(t){$('rStep').textContent=t;}
function stato(t){$('rStato').textContent=t;}
function ferma(){
  clearTimeout(S.to);clearTimeout(S.toVideo);if(S.pc)S.pc.close();S.pc=null;S.dcV=null;S.dcC=null;S.ruolo=null;S.sessione='';S.codice='';S.snd=null;S.vst=null;
  fermaScan();clearInterval(S.tick);clearInterval(S.stTick);clearInterval(S.stJpg);S.frames=0;S.sent=0;S.ultimo=null;S.stJson='';S.chipsKey='';S.fallback=false;
  if(S.wake){try{S.wake.release();}catch(e){}S.wake=null;}
  $('rVideo').srcObject=null;$('rVideo').style.display='';$('rFrame').style.display='none';
  document.body.classList.remove('tele','conn');
  ['rBox','rQrBox','rStop','rDett'].forEach(function(i){mostra(i,false);});mostra('rBtns',true);
  $('rTxt').value='';stato('');S.log=[];$('rLog').textContent='';$('rLog2').textContent='';
}
function collegato(){
  clearTimeout(S.to);fermaScan();mostra('rBox',false);mostra('rQrBox',false);mostra('rStop',true);
  stato('✅ Collegato · sessione '+S.sessione+(S.ruolo==='P'?' · il telecomando vede il tuo schermo':''));
  if(S.ruolo==='R'){
    document.body.classList.add('conn');$('tSess').textContent='Sessione '+S.sessione;riempiGr();controllaVideo();
    try{if(navigator.wakeLock)navigator.wakeLock.request('screen').then(function(l){S.wake=l;}).catch(function(){});}catch(e){}
  }else{
    setTimeout(avviaVideo,300);clearInterval(S.stTick);S.stTick=setInterval(inviaStato,200);
  }
}
function permessoCamera(){ // senza permesso il browser nasconde l'indirizzo locale e il collegamento può fallire
  return navigator.mediaDevices.getUserMedia({video:true}).then(function(s){s.getTracks().forEach(function(t){t.stop();});});
}
function mostraCodice(codice,etichetta){
  S.codice=codice;$('rTxt').value=codice;mostra('rQrBox',true);$('rQrInfo').textContent=etichetta+' · '+codice.length+' caratteri';
  carica('vendor/qrcode.js').then(function(){
    var qr=qrcode(0,'L');qr.addData(codice,'Byte');qr.make();
    var n=qr.getModuleCount(),k=Math.max(3,Math.floor(900/(n+8))),c=$('rQr'),q=4*k;
    c.width=c.height=(n+8)*k;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';
    for(var r=0;r<n;r++)for(var cc=0;cc<n;cc++)if(qr.isDark(r,cc))x.fillRect(q+cc*k,q+r*k,k,k);
    c.hidden=false;log('QR creato: '+n+'×'+n+' moduli');
  }).catch(function(e){$('rQr').hidden=true;passo('QR non disponibile ('+e.message+'). Usa il testo qui sotto: copialo e incollalo sull\'altro telefono.');});
}

// ---- lettura del QR con la fotocamera ----
function fermaScan(){
  clearInterval(S.scanTimer);
  if(S.scan){S.scan.getTracks().forEach(function(t){t.stop();});S.scan=null;}
  $('rScan').srcObject=null;mostra('rScan',false);
}
function scansiona(){
  if(typeof live!=='undefined'&&live){passo('Ferma prima il Video live: la fotocamera serve per leggere il codice. Dopo il collegamento puoi riavviarlo.');return;}
  fermaScan();
  Promise.all([carica('vendor/jsQR.js'),navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}}})]).then(function(r){
    var st=r[1],v=$('rScan');S.scan=st;v.srcObject=st;v.setAttribute('playsinline','');v.muted=true;v.play();mostra('rScan',true);
    passo('Inquadra il codice QR dell\'altro telefono (tutto intero e fermo, a 15-25 cm). Se non lo legge, copia e incolla il testo.');
    log('fotocamera accesa per leggere il QR');
    var cv2=document.createElement('canvas'),x=cv2.getContext('2d',{willReadFrequently:true}),n=0;
    S.scanTimer=setInterval(function(){
      if(!v.videoWidth)return;
      cv2.width=v.videoWidth;cv2.height=v.videoHeight;x.drawImage(v,0,0);
      var d=x.getImageData(0,0,cv2.width,cv2.height),q=jsQR(d.data,d.width,d.height,{inversionAttempts:'dontInvert'});
      if(++n%20===0)stato('Cerco il QR… ('+cv2.width+'×'+cv2.height+')');
      if(q&&q.data&&q.data.length>20){log('QR letto: '+q.data.length+' caratteri');fermaScan();usaCodice(q.data);}
    },150);
  }).catch(function(e){passo('Non riesco a usare la fotocamera ('+(e&&e.name||e.message||'errore')+'). Copia e incolla il codice a mano.');});
}

// ---- passi del collegamento ----
function avviaPrincipale(){
  S.ruolo='P';mostra('rBtns',false);mostra('rBox',true);mostra('rScanBtn',false);mostra('rDett',true);mostra('rStop',true);
  passo('Preparo il codice di collegamento…');log('principale: preparo il collegamento');
  permessoCamera().then(function(){
    var pc=S.pc=nuovoPc();creaCanali(pc);
    return pc.createOffer().then(function(o){return pc.setLocalDescription(o);}).then(function(){return attendiIce(pc);}).then(function(){
      var sdp=soloIPv4(pc.localDescription.sdp);S.sessione=sigla(sdp);
      var ind=indirizzi(sdp);log('indirizzi di questo telefono: '+(ind.join(', ')||'NESSUNO'));
      return comprimi('o'+sdp);});
  }).then(function(codice){
    passo('PASSO 1 di 2 · Sul telecomando premi "Questo è il telecomando" e fagli leggere questo QR (sessione '+S.sessione+'). PASSO 2 di 2 · Poi premi qui sotto "Inquadra il codice del telecomando".');
    stato('Sessione '+S.sessione+' · in attesa del telecomando');
    mostra('rScanBtn',true);mostraCodice(codice,'Codice del principale');
  }).catch(function(e){passo('Non riesco a preparare il collegamento: '+(e&&e.message||e.name||e));});
}
function avviaTelecomando(){
  S.ruolo='R';document.body.classList.add('tele');$('coppia').open=true;
  mostra('rBtns',false);mostra('rBox',true);mostra('rScanBtn',true);mostra('rQrBox',false);mostra('rDett',true);mostra('rStop',true);
  stato('In attesa del codice del principale');log('telecomando: avviato');
  passo('Sul telefono principale premi "Questo è il principale". Poi inquadra il suo QR con la fotocamera (parte da sola), oppure incolla il suo codice qui sotto.');
  permessoCamera().then(scansiona).catch(function(e){passo('Serve il permesso alla fotocamera per leggere il codice ('+(e&&e.name||'errore')+'). Puoi incollare il codice a mano.');});
}
function usaCodice(testo){
  passo('Elaboro il codice…');
  decomprimi(testo).then(function(t){
    var tipo=t.charAt(0),sdp=t.slice(1);
    if(S.ruolo==='R'&&tipo==='o')return rispondi(sdp);
    if(S.ruolo==='P'&&tipo==='a')return accettaRisposta(sdp);
    throw new Error(S.ruolo==='P'?'Questo è il codice del principale: qui serve quello del telecomando.':'Questo è il codice del telecomando: qui serve quello del principale.');
  }).catch(function(e){log('codice rifiutato: '+(e&&e.message||e.name||e));passo('Codice non accettato: '+(e&&e.message||e.name||e));});
}
function rispondi(sdp){
  var pc=S.pc=nuovoPc();S.sessione=sigla(sdp);creaCanali(pc);
  pc.ontrack=function(e){
    var v=$('rVideo');v.srcObject=e.streams[0]||new MediaStream([e.track]);log('video: traccia ricevuta');
    v.play().catch(function(){});
  };
  log('codice del principale ricevuto ('+sdp.length+' byte); indirizzi suoi: '+(indirizzi(sdp).join(', ')||'NESSUNO'));
  stato('✔ Codice del principale ricevuto · sessione '+S.sessione);
  return pc.setRemoteDescription({type:'offer',sdp:sdp}).then(function(){return pc.createAnswer();}).then(function(a){return pc.setLocalDescription(a);})
    .then(function(){return attendiIce(pc);}).then(function(){
      var r=soloIPv4(pc.localDescription.sdp);log('indirizzi di questo telefono: '+(indirizzi(r).join(', ')||'NESSUNO'));return comprimi('a'+r);}).then(function(codice){
      stato('✔ Codice del principale letto · sessione '+S.sessione+' · ora tocca al principale (vedi PASSO 2)');
      passo('PASSO 2 di 2 · Sessione '+S.sessione+' (deve essere uguale sul principale). Sul principale premi "Inquadra il codice del telecomando" e fagli leggere questo QR (oppure incolla il codice sul principale).');
      mostra('rScanBtn',false);mostraCodice(codice,'Codice del telecomando');
      S.to=setTimeout(function(){if(S.pc&&S.pc.connectionState!=='connected'){stato('⏳ Ora tocca al principale: deve premere "Inquadra il codice del telecomando" e leggere il QR che vedi qui (o incollare il codice).');}},20000);
    });
}
function accettaRisposta(sdp){
  if(!S.pc||S.pc.signalingState!=='have-local-offer')throw new Error('Il collegamento è già stato fatto o va ripreparato (premi Scollega e ricomincia).');
  log('risposta del telecomando ricevuta; indirizzi suoi: '+(indirizzi(sdp).join(', ')||'NESSUNO'));
  stato('✔ Risposta del telecomando ricevuta · collego…');passo('Risposta ricevuta. Collego i due telefoni… (di solito pochi secondi)');
  mostra('rQrBox',false);
  S.to=setTimeout(function(){if(S.pc&&S.pc.connectionState!=='connected'){fallito();}},25000);
  return S.pc.setRemoteDescription({type:'answer',sdp:sdp});
}

$('rPrinc').onclick=avviaPrincipale;
$('rTele').onclick=avviaTelecomando;
$('rScanBtn').onclick=scansiona;
$('rStop').onclick=ferma;
$('tStop').onclick=ferma;
$('rUsa').onclick=function(){var t=$('rTxt').value.trim();if(t&&t!==S.codice)usaCodice(t);else passo('Incolla qui il codice dell\'altro telefono, poi premi "Usa il codice incollato".');};
$('rCopia').onclick=function(){var t=$('rTxt');t.select();try{navigator.clipboard.writeText(t.value);}catch(e){document.execCommand('copy');}passo('Codice copiato.');};
// comandi del telecomando
$('tGr').onchange=function(){S.lock=Date.now();riempiPc(this.value);invia({t:'cmd',a:'gr',v:this.value});};
$('tPc').onchange=function(){S.lock=Date.now();invia({t:'cmd',a:'pc',v:+this.value});};
$('tLive').onclick=function(){invia({t:'cmd',a:'live'});};
$('tLock').onclick=function(){invia({t:'cmd',a:'lock'});};
$('tTorch').onclick=function(){invia({t:'cmd',a:'torch'});};
$('tFull').onclick=function(){invia({t:'cmd',a:'full'});};
window.addEventListener('pagehide',function(){if(S.pc)S.pc.close();});
S.usa=usaCodice;window.Remoto=S; // per i test
})();
