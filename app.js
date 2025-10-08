async function loadJSON(path){const r=await fetch(path);if(!r.ok)throw new Error(r.status);return r.json();}
function render(items){
  const root=document.getElementById('root');
  root.innerHTML=`<table class="table"><thead><tr><th>Imie i nazwisko</th><th>Klub</th></tr></thead>
  <tbody>${items.map(x=>`<tr><td>${x.name}</td><td>${x.club}</td></tr>`).join('')}</tbody></table>`;
}
(async()=>{
  try{
    const data=await loadJSON('./public/data/deputies.json');
    if(data.generated_at&&data.items){
      document.getElementById('lastUpdate').textContent=new Date(data.generated_at).toLocaleString('pl-PL');
      render(data.items);
    }else{render(data);}
  }catch(e){document.getElementById('root').textContent=`Blad ladowania danych: ${e.message}`;}
})();
