// Junta os modelos: site do 1 + formulário do 2 no topo + link pro cartão (3). Rodar: node montar-unido.js
const fs=require('fs'),p=f=>__dirname+'/modelos/'+f;
const m1=fs.readFileSync(p('modelo-1.html'),'utf8'), m2=fs.readFileSync(p('modelo-2.html'),'utf8');
const css2=m2.match(/\.check\{[\s\S]*?\.form \.seg\{[^}]*\}/)[0];
const form=m2.match(/<form class="form"[\s\S]*?<\/form>/)[0];
const script=m2.match(/<script>[\s\S]*?<\/script>/)[0];
let u=m1.replace(/<title>[^<]*<\/title>/,'<title>Modelo Unido — Rezende</title>');
u=u.replace('</style>',css2+'\n.form .btn{background:var(--marinho);color:#fff}.hero .duas{display:grid;grid-template-columns:1.1fr .9fr;gap:46px;align-items:center}.hero .form{color:var(--texto);position:relative;z-index:2}.hero .form h2{color:var(--marinho)}\n.links-bio{background:var(--gelo);text-align:center}\n@media(max-width:860px){.hero .duas{grid-template-columns:1fr}}\n</style>');
u=u.replace(/(<section class="hero"><div class="wrap">)([\s\S]*?)(<svg class="rgrande")/,(a,b,c,d)=>b+'<div class="duas"><div>'+c.replace('<a class="btn btn-borda" style="color:#fff;margin-left:10px" href="#servicos">Ver serviços</a>','')+'</div>'+form+'</div>'+d);
u=u.replace('<section><div class="wrap"><div class="chamada">','<section class="links-bio"><div class="wrap"><div class="tag">Para o Instagram e o WhatsApp</div><h2 style="font-size:28px;margin:8px 0 12px">Cartão digital da Emilly</h2><p style="margin-bottom:18px">Uma página curta com todos os contatos, para a bio e para enviar aos clientes.</p><a class="btn btn-claro btn-borda" style="color:var(--marinho)" href="modelo-3.html">Ver o cartão digital (/links)</a></div></section>\n<section><div class="wrap"><div class="chamada">');
u=u.replace('</body>',script+'\n</body>');
fs.writeFileSync(p('modelo-unido.html'),u);
console.log('unido ok', (u.match(/class="card"/g)||[]).length, 'cartões', u.includes('<form'));
