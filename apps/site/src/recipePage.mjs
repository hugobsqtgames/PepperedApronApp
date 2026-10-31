import { page } from './layout.mjs';

/** App Store page of the app (App Store Connect app id). */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6829014530';

const TEXT = {
  fr: {
    title: 'Une recette pour vous',
    open: 'Ouvrir dans PepperedApron',
    get: 'Télécharger PepperedApron',
    hint: 'La recette s’ajoute à votre carnet en un geste, avec ses ingrédients et ses étapes.',
    ingredients: 'Ingrédients',
    steps: 'Préparation',
    tips: 'Astuces',
    prep: 'Préparation',
    cook: 'Cuisson',
    oven: 'Four',
    source: 'Source',
    broken:
      'Ce lien de recette est incomplet ou abîmé. Demandez à la personne de vous le renvoyer.',
    old: 'Votre navigateur est trop ancien pour afficher cette recette. Ouvrez le lien dans Safari à jour ou dans l’app.',
    privacy: 'La recette est dans le lien lui-même : elle n’est envoyée à aucun serveur.',
  },
  en: {
    title: 'A recipe for you',
    open: 'Open in PepperedApron',
    get: 'Get PepperedApron',
    hint: 'The recipe goes into your cookbook in one tap, with its ingredients and steps.',
    ingredients: 'Ingredients',
    steps: 'Method',
    tips: 'Tips',
    prep: 'Prep',
    cook: 'Cook',
    oven: 'Oven',
    source: 'Source',
    broken: 'This recipe link is incomplete or damaged. Ask the sender to send it again.',
    old: 'Your browser is too old to show this recipe. Open the link in an up-to-date Safari or in the app.',
    privacy: 'The recipe is inside the link itself: it is not sent to any server.',
  },
};

/**
 * /r/#<data>: a recipe shared from the app. The recipe is in the part of the link after "#",
 * which the browser never sends to the server; it is unpacked and shown here (DOM text only, no
 * HTML from the link), with a button that opens it in the app (pepperedapron://r/<data>).
 */
export function recipePage() {
  const texts = JSON.stringify(TEXT);
  const script = `(function(){
var T=${texts};var lang=(navigator.language||'en').slice(0,2)==='fr'?'fr':'en';var t=T[lang];
document.documentElement.lang=lang;document.title=t.title+' · PepperedApron';
var root=document.getElementById('recipe');
function el(tag,text,cls){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;root.appendChild(e);return e}
function fail(msg){root.textContent='';el('h1',t.title);el('p',msg,'muted');store()}
function store(){var a=el('a',t.get,'button secondary');a.href=${JSON.stringify(APP_STORE_URL)}}
var data=(location.hash||'').slice(1);
if(!/^[A-Za-z0-9_-]{10,}$/.test(data))return fail(t.broken);
if(typeof DecompressionStream==='undefined')return fail(t.old);
var b64=data.replace(/-/g,'+').replace(/_/g,'/');var bin;try{bin=atob(b64)}catch(e){return fail(t.broken)}
var bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text().then(function(json){
var r=JSON.parse(json);if(!r||r.v!==1||typeof r.t!=='string')throw new Error('format');
root.textContent='';
el('h1',String(r.t).slice(0,200));
if(r.d)el('p',String(r.d).slice(0,1000),'muted');
var facts=[];var s=Number(r.s);if(s>0)facts.push(lang==='fr'?'Pour '+s+' personne'+(s>1?'s':''):'Serves '+s);
if(r.p)facts.push(t.prep+' '+Number(r.p)+' min');if(r.c)facts.push(t.cook+' '+Number(r.c)+' min');if(r.o)facts.push(t.oven+' '+Number(r.o)+' °C');
if(facts.length)el('p',facts.join(' · '),'facts');
var open=el('a',t.open,'button');open.href='pepperedapron://r/'+data;
store();
el('p',t.hint,'muted small');
var c=el('div',null,'card');var h=document.createElement('h2');h.textContent=t.ingredients;c.appendChild(h);
var ul=document.createElement('ul');(Array.isArray(r.i)?r.i:[]).slice(0,200).forEach(function(x){var li=document.createElement('li');li.textContent=String(x).slice(0,500);ul.appendChild(li)});c.appendChild(ul);
var c2=el('div',null,'card');var h2=document.createElement('h2');h2.textContent=t.steps;c2.appendChild(h2);
var ol=document.createElement('ol');(Array.isArray(r.st)?r.st:[]).slice(0,100).forEach(function(x){var li=document.createElement('li');li.textContent=String(x).slice(0,5000);ol.appendChild(li)});c2.appendChild(ol);
if(r.n){var c3=el('div',null,'card');var h3=document.createElement('h2');h3.textContent=t.tips;c3.appendChild(h3);var p=document.createElement('p');p.textContent=String(r.n).slice(0,5000);c3.appendChild(p)}
if(typeof r.u==='string'&&/^https?:\\/\\//.test(r.u)){var src=el('p',t.source+' : ','muted small');var a=document.createElement('a');a.href=r.u;a.rel='noopener nofollow';a.textContent=new URL(r.u).hostname;src.appendChild(a)}
el('p',t.privacy,'muted small');
}).catch(function(){fail(t.broken)});
})();`;
  const style = `<meta name="robots" content="noindex"><meta name="apple-itunes-app" content="app-id=6829014530">
<style>.button{display:block;text-align:center;background:var(--primary);color:var(--bg);font-weight:700;text-decoration:none;padding:14px 20px;border-radius:16px;margin:12px 0}
.button.secondary{background:transparent;color:var(--primary);border:1.5px solid var(--primary)}.facts{font-weight:600;color:var(--accent)}.small{font-size:14px}ol li{margin:10px 0}</style>`;
  return page({
    title: TEXT.en.title,
    lang: 'en',
    head: style,
    body: `<div id="recipe" aria-live="polite"><h1>PepperedApron</h1><noscript><p>${TEXT.en.old}</p></noscript></div><script>${script}</script>`,
    description: TEXT.en.hint,
  });
}
