// Venda de fotos de eventos (links abertos), usado dentro do Meu portal.
// Gerado a partir da antiga página Meus eventos: os ids das telas têm o prefixo ev_.
(function () {
var dados = { portal: null, tipos: [], eventos: [] };
var editando = 0;
var aberto = null;
var pagina = 0;

async function api(rota, corpo) {
  var op = corpo === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) };
  var r = await fetch(rota, op);
  if (r.status === 401) { window.location.href = "/entrar?volta=" + encodeURIComponent("/meu-portal?aba=abertos"); throw new Error("login"); }
  var d = {};
  try { d = await r.json(); } catch (e) {}
  return { ok: r.ok, dados: d };
}

function el(tag, classe, texto) {
  var e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
function mostrar(id, sim) { document.getElementById(id).classList.toggle("hidden", !sim); }
function reais(c) { return "R$ " + (c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function dataBr(t) { if (!t) return ""; var d = t.slice(0, 10).split("-"); return d[2] + "/" + d[1] + "/" + d[0]; }
function paraSlug(t) { return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
function centavos(v) { var t = String(v || "").trim().replace(/^R\$\s*/i, ""); if (t.indexOf(",") > -1) t = t.replace(/\./g, "").replace(",", "."); var n = parseFloat(t); return isNaN(n) ? 0 : Math.round(n * 100); }
function textoPreco(c) { return (c / 100).toFixed(2).replace(".", ","); }

/* ---------- formulário ---------- */

function linhaFaixa(qtd, preco) {
  var linha = el("div", "grid grid-cols-2 md:grid-cols-3 gap-2 items-center faixa");
  var a = el("input", "campo"); a.type = "number"; a.min = 2; a.placeholder = "a partir de (fotos)"; a.value = qtd || "";
  var p = el("input", "campo"); p.inputMode = "decimal"; p.placeholder = "R$ cada foto"; p.value = preco || "";
  [a, p].forEach(function (x) { x.addEventListener("input", exemplo); });
  linha.appendChild(a);
  linha.appendChild(p);
  linha.appendChild(el("span", "text-xs text-slate-500 hidden md:block", "ex.: a partir de 5 fotos, R$ 10,00 cada"));
  document.getElementById("ev_faixas").appendChild(linha);
}

function faixasDoForm() {
  return Array.from(document.querySelectorAll(".faixa")).map(function (l) {
    var i = l.querySelectorAll("input");
    return { a_partir: i[0].value, preco: i[1].value };
  }).filter(function (f) { return f.a_partir || f.preco; });
}

// Mostra como fica a conta para o comprador (o servidor calcula de novo na hora do pedido).
function exemplo() {
  var preco = centavos(document.getElementById("ev_evPreco").value);
  if (!preco) { document.getElementById("ev_exemploPreco").textContent = ""; return; }
  var f = faixasDoForm().map(function (x) { return { a: parseInt(x.a_partir, 10), p: centavos(x.preco) }; }).filter(function (x) { return x.a && x.p; });
  var txt = "1 foto: " + reais(preco);
  f.sort(function (x, y) { return x.a - y.a; }).forEach(function (x) { txt += " · a partir de " + x.a + ": " + reais(x.p) + " cada (" + x.a + " = " + reais(x.p * x.a) + ")"; });
  document.getElementById("ev_exemploPreco").textContent = "Como o comprador vê: " + txt;
}

function limparForm() {
  editando = 0;
  ["ev_evTitulo", "ev_evSlug", "ev_evData", "ev_evLocal", "ev_evPreco", "ev_evMarca"].forEach(function (id) { document.getElementById(id).value = ""; });
  document.getElementById("ev_evPublicado").checked = true;
  document.getElementById("ev_faixas").innerHTML = "";
  linhaFaixa(5, "");
  linhaFaixa(10, "");
  document.getElementById("ev_formTitulo").textContent = "Novo evento";
  document.getElementById("ev_btnSalvarEv").textContent = "Criar evento";
  mostrar("ev_btnCancelarEv", false);
  document.getElementById("ev_evErro").textContent = "";
  document.getElementById("ev_evMarca").placeholder = dados.portal ? dados.portal.nome : "nome do seu estúdio";
  exemplo();
}

function editar(ev) {
  editando = ev.id;
  document.getElementById("ev_evTitulo").value = ev.titulo;
  document.getElementById("ev_evSlug").value = ev.slug;
  document.getElementById("ev_evTipo").value = ev.tipo || "Outro";
  document.getElementById("ev_evData").value = ev.data || "";
  document.getElementById("ev_evLocal").value = ev.local || "";
  document.getElementById("ev_evPreco").value = textoPreco(ev.preco_centavos);
  document.getElementById("ev_evMarca").value = ev.marca_texto || "";
  document.getElementById("ev_evPublicado").checked = ev.publicado;
  document.getElementById("ev_faixas").innerHTML = "";
  ev.faixas.forEach(function (f) { linhaFaixa(f.a_partir, textoPreco(f.preco_centavos)); });
  linhaFaixa("", "");
  document.getElementById("ev_formTitulo").textContent = "Editando: " + ev.titulo;
  document.getElementById("ev_btnSalvarEv").textContent = "Salvar alterações";
  mostrar("ev_btnCancelarEv", true);
  exemplo();
  document.getElementById("ev_secForm").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("ev_evTitulo").addEventListener("input", function () {
  if (!editando) document.getElementById("ev_evSlug").value = paraSlug(this.value);
});
document.getElementById("ev_evPreco").addEventListener("input", exemplo);
document.getElementById("ev_btnCancelarEv").addEventListener("click", limparForm);

document.getElementById("ev_btnSalvarEv").addEventListener("click", async function () {
  var erro = document.getElementById("ev_evErro");
  erro.textContent = "";
  var r = await api("/api/eventos/salvar", {
    id: editando || undefined,
    titulo: document.getElementById("ev_evTitulo").value,
    slug: document.getElementById("ev_evSlug").value,
    tipo: document.getElementById("ev_evTipo").value,
    data: document.getElementById("ev_evData").value,
    local: document.getElementById("ev_evLocal").value,
    preco: document.getElementById("ev_evPreco").value,
    faixas: faixasDoForm(),
    marca_texto: document.getElementById("ev_evMarca").value,
    publicado: document.getElementById("ev_evPublicado").checked
  });
  if (!r.ok) { erro.textContent = r.dados.error || "Não foi possível salvar."; return; }
  var id = r.dados.id;
  limparForm();
  await carregar();
  var ev = dados.eventos.find(function (e) { return e.id === id; });
  if (ev) abrir(ev);
});

document.getElementById("ev_btnPix").addEventListener("click", async function () {
  var r = await api("/api/portal/pagamento", { instrucoes: document.getElementById("ev_pixTexto").value });
  if (!r.ok) { alert(r.dados.error || "Não foi possível salvar."); return; }
  mostrar("ev_pixOk", true);
  setTimeout(function () { mostrar("ev_pixOk", false); }, 2500);
  carregar();
});

/* ---------- lista ---------- */

async function carregar() {
  var r = await api("/api/eventos");
  dados = r.dados;
  mostrar("ev_carregando", false);
  mostrar("ev_semPortal", !dados.portal);
  if (!dados.portal) return;
  mostrar("ev_secPix", true);
  mostrar("ev_pixAviso", !dados.portal.tem_pix);
  if (document.activeElement !== document.getElementById("ev_pixTexto")) document.getElementById("ev_pixTexto").value = dados.portal.instrucoes || "";
  mostrar("ev_secForm", true);
  var tipo = document.getElementById("ev_evTipo");
  if (!tipo.options.length) dados.tipos.forEach(function (t) { tipo.appendChild(new Option(t, t)); });
  if (!document.querySelector(".faixa")) limparForm();

  var lista = document.getElementById("ev_secLista");
  lista.innerHTML = "";
  mostrar("ev_secLista", dados.eventos.length > 0);
  var vazio = document.getElementById("evVazio");
  if (vazio) vazio.classList.toggle("hidden", dados.eventos.length > 0);
  if (window.carregarCentral) window.carregarCentral();
  dados.eventos.forEach(function (ev) {
    var c = el("div", "glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3");
    var info = el("div");
    info.appendChild(el("p", "text-xs uppercase tracking-wider text-slate-400", (ev.tipo || "") + (ev.data ? " · " + dataBr(ev.data) : "") + (ev.publicado ? "" : " · FORA DO AR")));
    info.appendChild(el("p", "font-bold text-lg", ev.titulo));
    info.appendChild(el("p", "text-sm text-slate-400", ev.fotos + " foto(s) · " + ev.fotos_vendidas + " vendida(s) · " + reais(ev.vendido) + " recebido" +
      (ev.pendentes ? " · " : "")));
    if (ev.pendentes) info.lastChild.appendChild(el("span", "text-amber-300 font-semibold", ev.pendentes + " pedido(s) esperando o PIX"));
    c.appendChild(info);
    var b = el("button", "cta font-bold px-5 py-2.5 rounded-xl text-sm", "Abrir");
    b.type = "button";
    b.addEventListener("click", function () { abrir(ev); });
    c.appendChild(b);
    lista.appendChild(c);
  });
}

/* ---------- evento aberto ---------- */

async function abrir(ev) {
  if (window.hubAba) window.hubAba("abertos");
  aberto = ev;
  pagina = 0;
  document.getElementById("ev_abTipo").textContent = (ev.tipo || "") + (ev.data ? " · " + dataBr(ev.data) : "") + (ev.local ? " · " + ev.local : "");
  document.getElementById("ev_abTitulo").textContent = ev.titulo;
  var link = window.location.origin + "/e/" + ev.slug;
  var a = document.getElementById("ev_abLink");
  a.textContent = link;
  a.href = link;
  document.getElementById("ev_grade").innerHTML = "";
  mostrar("ev_secAberto", true);
  document.getElementById("ev_secAberto").scrollIntoView({ behavior: "smooth" });
  await Promise.all([carregarFotos(), carregarPedidos()]);
}

async function carregarFotos() {
  var r = await api("/api/eventos/fotos?id=" + aberto.id + "&pagina=" + pagina);
  if (!r.ok) return;
  document.getElementById("ev_abInfo").textContent = "(" + r.dados.total + ")";
  var grade = document.getElementById("ev_grade");
  if (!r.dados.total) grade.appendChild(el("p", "col-span-full text-sm text-slate-400", "Nenhuma foto ainda. Envie as fotos acima."));
  r.dados.fotos.forEach(function (f) {
    var c = el("div", "mini");
    var img = el("img");
    img.loading = "lazy";
    img.src = f.previa;
    img.alt = f.nome;
    c.appendChild(img);
    if (f.vendas) c.appendChild(el("span", "absolute top-1 left-1 text-[11px] font-bold bg-emerald-500 text-white rounded-full px-2", f.vendas + " venda(s)"));
    var rodape = el("div", "p-1.5 space-y-1");
    var num = el("input", "campo text-xs");
    num.style.padding = "5px 8px";
    num.placeholder = "nº de peito";
    num.value = f.numeros;
    num.title = f.nome;
    num.addEventListener("change", async function () {
      var x = await api("/api/eventos/foto/numeros", { id: f.id, numeros: num.value });
      num.style.borderColor = x.ok ? "#10b981" : "#ef4444";
    });
    rodape.appendChild(num);
    var rm = el("button", "perigo text-xs", "Apagar");
    rm.type = "button";
    rm.addEventListener("click", async function () {
      if (!confirm("Apagar esta foto (" + f.nome + ")?")) return;
      var x = await api("/api/eventos/foto/remover", { id: f.id });
      if (x.ok) c.remove(); else alert(x.dados.error || "Não foi possível apagar.");
    });
    rodape.appendChild(rm);
    c.appendChild(rodape);
    grade.appendChild(c);
  });
  mostrar("ev_btnMais", (r.dados.pagina + 1) * r.dados.por_pagina < r.dados.total);
}

document.getElementById("ev_btnMais").addEventListener("click", function () { pagina++; carregarFotos(); });

async function carregarPedidos() {
  var r = await api("/api/eventos/pedidos?id=" + aberto.id);
  var lista = document.getElementById("ev_listaPedidos");
  lista.innerHTML = "";
  if (!r.ok) return;
  if (!r.dados.pedidos.length) lista.appendChild(el("p", "text-sm text-slate-400", "Nenhum pedido ainda. Divulgue o link do evento!"));
  r.dados.pedidos.forEach(function (p) {
    var cor = p.status === "pago" ? "border-emerald-500/40" : p.status === "cancelado" ? "border-slate-600 opacity-60" : "border-amber-400/50";
    var c = el("div", "bg-slate-900/50 border rounded-xl px-4 py-3 " + cor);
    var topo = el("div", "flex flex-wrap items-center justify-between gap-2");
    topo.appendChild(el("p", "font-semibold", p.nome + " · " + p.qtd + " foto(s) · " + reais(p.valor_centavos) +
      (p.status === "pago" ? " · ✔ pago" : p.status === "cancelado" ? " · cancelado" : " · esperando PIX")));
    var acoes = el("div", "flex gap-4");
    function botao(txt, classe, status) {
      var b = el("button", classe, txt);
      b.type = "button";
      b.addEventListener("click", async function () {
        if (status === "pago" && !confirm("Confirma que o PIX de " + reais(p.valor_centavos) + " de " + p.nome + " caiu na sua conta?\nAs fotos originais serão liberadas para a pessoa.")) return;
        b.disabled = true;
        var x = await api("/api/eventos/pedidos/status", { id: p.id, status: status });
        if (!x.ok) alert(x.dados.error || "Não foi possível.");
        carregarPedidos();
        carregar();
      });
      acoes.appendChild(b);
    }
    if (p.status !== "pago") botao("✔ Pago", "link text-emerald-300", "pago");
    if (p.status === "pendente") botao("Cancelar", "perigo", "cancelado");
    if (p.status !== "pendente") botao("Voltar para pendente", "text-xs text-slate-400 hover:text-white", "pendente");
    topo.appendChild(acoes);
    c.appendChild(topo);
    c.appendChild(el("p", "text-xs text-slate-400 break-all", p.email + (p.whatsapp ? " · WhatsApp " + p.whatsapp : "") + " · " + dataBr(p.created_at)));
    var det = el("details", "text-xs text-slate-400 mt-1");
    det.appendChild(el("summary", "cursor-pointer", "Ver as fotos escolhidas"));
    det.appendChild(el("p", "mt-1 break-words", p.arquivos.join(", ")));
    c.appendChild(det);
    lista.appendChild(c);
  });
}

document.getElementById("ev_btnAtualizarPedidos").addEventListener("click", carregarPedidos);
document.getElementById("ev_btnFechar").addEventListener("click", function () { mostrar("ev_secAberto", false); aberto = null; });
document.getElementById("ev_btnEditar").addEventListener("click", function () { editar(aberto); });
document.getElementById("ev_abCopiar").addEventListener("click", function () {
  navigator.clipboard.writeText(document.getElementById("ev_abLink").textContent);
  this.textContent = "Copiado!";
});

document.getElementById("ev_btnApagar").addEventListener("click", async function () {
  if (!confirm("Apagar o evento \"" + aberto.titulo + "\" com TODAS as fotos e pedidos?\nIsso não pode ser desfeito e o link para de funcionar.")) return;
  var botao = this;
  botao.disabled = true;
  while (true) {
    var r = await api("/api/eventos/remover", { id: aberto.id });
    if (!r.ok) { alert(r.dados.error || "Não foi possível apagar."); break; }
    if (!r.dados.restantes) break;
    botao.textContent = "Apagando... faltam " + r.dados.restantes + " arquivo(s)";
  }
  botao.disabled = false;
  botao.textContent = "Apagar evento, fotos e pedidos";
  mostrar("ev_secAberto", false);
  aberto = null;
  carregar();
});

/* ---------- envio: original + prévia com marca d'água ---------- */

var LADO_PREVIA = 1400;

async function abrirImagem(arquivo) {
  // createImageBitmap já gira a foto pela orientação do celular (EXIF).
  if (window.createImageBitmap) {
    try { return await createImageBitmap(arquivo, { imageOrientation: "from-image" }); } catch (e) {}
  }
  return await new Promise(function (ok, falha) {
    var img = new Image();
    img.onload = function () { ok(img); };
    img.onerror = function () { falha(new Error("Não foi possível ler a imagem")); };
    img.src = URL.createObjectURL(arquivo);
  });
}

async function criarPrevia(arquivo, marca) {
  var img = await abrirImagem(arquivo);
  var w = img.width, h = img.height;
  var esc = Math.min(1, LADO_PREVIA / Math.max(w, h));
  w = Math.round(w * esc);
  h = Math.round(h * esc);
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var g = c.getContext("2d");
  g.drawImage(img, 0, 0, w, h);
  // Marca d'água repetida na diagonal: difícil de cortar ou apagar.
  var fonte = Math.max(18, Math.round(Math.max(w, h) / 22));
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(-Math.PI / 6);
  g.font = "bold " + fonte + "px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  var txt = "© " + marca + " · PRÉVIA";
  var passoX = g.measureText(txt).width + fonte * 2;
  var passoY = fonte * 3.2;
  var lim = Math.max(w, h);
  for (var y = -lim; y <= lim; y += passoY) {
    for (var x = -lim * 1.2 + ((y / passoY) % 2 ? passoX / 2 : 0); x <= lim * 1.2; x += passoX) {
      g.lineWidth = Math.max(2, fonte / 10);
      g.strokeStyle = "rgba(0,0,0,0.28)";
      g.strokeText(txt, x, y);
      g.fillStyle = "rgba(255,255,255,0.42)";
      g.fillText(txt, x, y);
    }
  }
  g.restore();
  return await new Promise(function (ok) { c.toBlob(ok, "image/jpeg", 0.72); });
}

function enviarParaB2(url, conteudo, aoProgredir) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = function (e) { if (e.lengthComputable && aoProgredir) aoProgredir(e.loaded); };
    xhr.onload = function () { xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("O armazenamento recusou o envio (" + xhr.status + ")")); };
    xhr.onerror = function () { reject(new Error("Falha de conexão no envio")); };
    xhr.send(conteudo);
  });
}

async function enviarArquivo(nome, conteudo, aoProgredir) {
  var p = await api("/api/files/upload-url", { name: nome, size: conteudo.size, evento_id: aberto.id });
  if (!p.ok) throw new Error(p.dados.error || "Não foi possível enviar");
  await enviarParaB2(p.dados.url, conteudo, aoProgredir);
  var fim = await api("/api/files/complete", { id: p.dados.id });
  if (!fim.ok) throw new Error(fim.dados.error || "Não foi possível finalizar");
  return p.dados.id;
}

document.getElementById("ev_btnEnviar").addEventListener("click", function () { document.getElementById("ev_arquivosEnviar").click(); });

document.getElementById("ev_arquivosEnviar").addEventListener("change", async function () {
  var lista = Array.from(this.files);
  this.value = "";
  if (!lista.length || !aberto) return;
  var marca = aberto.marca_texto || (dados.portal && dados.portal.nome) || "Master Nuvem";
  var numeros = document.getElementById("ev_numerosLeva").value;
  var total = lista.reduce(function (s, f) { return s + f.size; }, 0);
  var feito = 0, falhas = 0;
  var texto = document.getElementById("ev_progTexto");
  var barra = document.getElementById("ev_progBarra");
  mostrar("ev_progresso", true);
  document.getElementById("ev_btnEnviar").disabled = true;
  for (var i = 0; i < lista.length; i++) {
    var f = lista[i];
    texto.textContent = "Foto " + (i + 1) + " de " + lista.length + ": criando a prévia com marca d'água...";
    try {
      var previa = await criarPrevia(f, marca);
      texto.textContent = "Foto " + (i + 1) + " de " + lista.length + ": enviando " + f.name;
      var idOriginal = await enviarArquivo(f.name, f, function (n) { barra.style.width = Math.round((feito + n) / total * 100) + "%"; });
      var idPrevia = await enviarArquivo("previa-" + f.name.replace(/\.[^.]+$/, "") + ".jpg", previa);
      var ligou = await api("/api/eventos/foto", { evento_id: aberto.id, original_id: idOriginal, previa_id: idPrevia, numeros: numeros });
      if (!ligou.ok) throw new Error(ligou.dados.error || "Não foi possível salvar a foto");
    } catch (e) {
      falhas++;
      if (/Espaço insuficiente|plano/.test(e.message)) { alert(e.message); break; }
    }
    feito += f.size;
    barra.style.width = Math.round(feito / total * 100) + "%";
  }
  texto.textContent = falhas ? "Terminou com " + falhas + " erro(s). Envie de novo as que faltaram." : "Pronto! " + lista.length + " foto(s) publicada(s) com marca d'água.";
  document.getElementById("ev_btnEnviar").disabled = false;
  document.getElementById("ev_grade").innerHTML = "";
  pagina = 0;
  carregarFotos();
  carregar();
});

window.EV = { carregar: carregar, novo: limparForm, abrir: abrir };
carregar().catch(function () {});
})();
