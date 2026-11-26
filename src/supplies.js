// Bottling dry goods and cellar chemicals, built from each wine's package and each lot's process events rather than a
// flat cost per case. Prices are researched (see sources.js); usage rates are winemaking practice and live in G so they
// can be changed. All volumes are gallons; additions are converted to liters (3.785 L/gal) and hectoliters where dosed.

// ---- Packaging: per bottle, chosen per wine ----
const GLASS={light:{name:'Light glass, about 400 g',cost:0.80},standard:{name:'Standard glass, about 550 g',cost:1.00},heavy:{name:'Heavy glass, 750 g or more',cost:2.00}};
const CLOSURE={screwcap:{name:'Screwcap',cost:0.25},synthetic:{name:'Synthetic or plant-based',cost:0.45},technical:{name:'Technical or micro-agglomerate cork',cost:0.30},natural:{name:'Natural cork, mid grade',cost:0.55},naturalTop:{name:'Natural cork, top grade',cost:1.00}};
const CAPSULE={none:{name:'No capsule',cost:0},pvc:{name:'PVC capsule',cost:0.06},polylam:{name:'Polylaminate capsule',cost:0.10},tin:{name:'Tin capsule',cost:0.35}};
// a screwcap's own skirt takes the place of a capsule, so screwcap always means no capsule
const pkgOf=v=>{const closure=CLOSURE[v.closure]?v.closure:'technical';return {glass:GLASS[v.glass]?v.glass:'standard',closure,capsule:closure==='screwcap'?'none':CAPSULE[v.capsule]?v.capsule:'polylam'}};
function bottleParts(v,G){const k=pkgOf(v);return {glass:GLASS[k.glass].cost,closure:CLOSURE[k.closure].cost,capsule:CAPSULE[k.capsule].cost,labels:G.labelSet}}
function bottleCost(v,G){const b=bottleParts(v,G);return b.glass+b.closure+b.capsule+b.labels}
// dry goods and the mobile line, per case
function dryCase(v,G){return 12*bottleCost(v,G)+G.carton+G.bottling}

// ---- Cellar chemicals and supplies ----
const CHEM={
 kmbs:{name:'Potassium metabisulfite',unit:'kg',price:9.56},
 yeast:{name:'Active dry yeast',unit:'kg',price:118},
 complex:{name:'Complex yeast nutrient',unit:'kg',price:41},
 dap:{name:'Diammonium phosphate (DAP)',unit:'kg',price:9.0},
 ml:{name:'Malolactic bacteria',unit:'hL dosed',price:6.08},
 tartaric:{name:'Tartaric acid',unit:'kg',price:13.0},
 bentonite:{name:'Bentonite',unit:'kg',price:1.98},
 pads:{name:'Filter pads, 40 x 40 cm',unit:'pad',price:4.0},
 co2:{name:'CO2 gas for purging tanks',unit:'lb',price:1.57},
 dryIce:{name:'Dry ice for cold soak and blanketing',unit:'lb',price:0.76},
 perc:{name:'Sodium percarbonate (cleaning)',unit:'kg',price:4.0},
 citric:{name:'Citric acid (cleaning rinse)',unit:'kg',price:8.97},
 sulfur:{name:'Sulfur discs for empty barrels',unit:'disc',price:0.25}
};
const L_GAL=3.785, KMBS_SO2=0.576, DAP_N=0.21, DAP_MAX=0.96; // g/L; 27 CFR 24.246 limit on ammonium phosphate
const TANK_LOCS=['redTank','whiteTank','storage','blend'];
// Nutrients for a lot: target YAN rises with Brix; a complex nutrient goes in first, DAP covers the rest up to the legal limit.
function nutrientPlan(v,G){
  const target=G.yanTarget21+G.yanPerBrix*Math.max(0,v.brix-21), deficit=Math.max(0,target-G.yanHarvest);
  const complexN=deficit>0?G.complexRate*G.complexYan/25:0;          // complexYan is mg/L YAN per 25 g/hL
  const dapGL=Math.min(DAP_MAX,Math.max(0,deficit-complexN)/(DAP_N*1000));
  const added=complexN+dapGL*DAP_N*1000;
  return {target,deficit,complexGhL:deficit>0?G.complexRate:0,dapGL,added,short:Math.max(0,deficit-added)};
}
// Quantities for one vintage of every lot, priced. Returns per-wine totals (they ride in that wine's cost per case),
// winery-level items (sulfuring empty barrels), and itemized lines for the page.
function chemicals(FL,V,G){
  const q={},per=V.map(()=>0),addQ=(k,amt,wi)=>{if(!(amt>0))return;q[k]=(q[k]||0)+amt;if(wi!=null)per[wi]+=amt*CHEM[k].price};
  const so2=(mgL,gal,wi)=>addQ('kmbs',mgL*gal*L_GAL/1e6/KMBS_SO2,wi);
  const clean=(tankGal,wi)=>{const sol=Math.max(G.cipGalMin,G.cipFrac*tankGal);addQ('perc',sol*G.percGpg/1000,wi);addQ('citric',sol*G.citricGpg/1000,wi)};
  const short=[];
  FL.lots.forEach(L=>{
    const v=V[L.wi],wi=L.wi,red=L.color==='red',S=L.segs;
    const must=red?L.mustGal:S.filter(s=>s.loc==='press').reduce((a,s)=>a+s.gal,0), hL=must*L_GAL/100;
    addQ('yeast',hL*G.yeastRate/1000,wi);
    const n=nutrientPlan(v,G);addQ('complex',hL*n.complexGhL/1000,wi);addQ('dap',must*L_GAL*n.dapGL/1000,wi);if(n.short>0.5)short.push({wine:v.name,lot:L.j,short:n.short});
    addQ('tartaric',must*L_GAL*(red?G.acidRed:G.acidWhite)/1000,wi);
    so2(G.so2Crush,must,wi);
    if(red&&(v.soak??0)>0)addQ('dryIce',L.tons*G.dryIceLbTon,wi);
    const ws=S.filter(s=>!s.ev&&s.loc!=='bottled').sort((a,b)=>a.a-b.a);
    const after=ws.find(s=>s.loc==='storage'||s.loc==='barrel'), wineGal=after?after.gal:must*0.94;
    if(v.ml??red)addQ('ml',wineGal*L_GAL/100,wi);
    so2(G.so2PostAF,wineGal,wi);
    // each move between vessels: rack addition to the wine, purge the receiving tank, clean the vessel left behind
    for(let i=1;i<ws.length;i++){const fr=ws[i-1],to=ws[i];
      if(fr.loc!=='redTank'&&fr.loc!=='whiteTank')so2(G.so2Rack,to.gal,wi);
      if(TANK_LOCS.includes(to.loc))addQ('co2',to.gal/7.48*0.114*G.purgeVolumes,wi);
      if(TANK_LOCS.includes(fr.loc))clean(fr.gal,wi);
      if(fr.loc==='barrel')addQ('perc',fr.units*G.barrelPercShare*5*G.percGpg/1000,wi);}
    S.filter(s=>s.loc==='barrel').forEach(s=>so2(G.so2Barrel,s.gal*Math.floor((s.b-s.a)/G.so2BarrelDays),wi));
    const blend=S.find(s=>s.loc==='blend');
    if(blend){so2(G.so2Bottle,blend.gal,wi);if(!red)addQ('bentonite',blend.gal*L_GAL*G.bentWhite/1000,wi);addQ('pads',Math.ceil(blend.gal/G.galPerPad)*G.filterPasses,wi);clean(blend.gal,wi)}
    L.picks.forEach(()=>{clean(400,wi);clean(400,wi)}); // crush line and press cleanup on each pick day
  });
  // everything not itemized above (enzymes, tannins, other fining agents, sanitizer, gaskets), as an explicit allowance
  V.forEach((v,wi)=>{q.other=(q.other||0)+v.cases;per[wi]+=v.cases*G.otherSupplies});
  // winery level: empty barrels sulfured about monthly
  const discs=(FL.emptyBarrelDays||0)/30;addQ('sulfur',discs,null);
  const winery=discs*CHEM.sulfur.price;
  const lines=Object.keys(CHEM).filter(k=>q[k]>0).map(k=>({k,name:CHEM[k].name,qty:q[k],unit:CHEM[k].unit,price:CHEM[k].price,cost:q[k]*CHEM[k].price}));
  if(q.other>0)lines.push({k:'other',name:'Other supplies, not itemized',qty:q.other,unit:'case',price:G.otherSupplies,cost:q.other*G.otherSupplies});
  const total=lines.reduce((a,l)=>a+l.cost,0);
  return {lines,per,winery,total,short};
}
if(typeof module!=='undefined')module.exports={GLASS,CLOSURE,CAPSULE,CHEM,DAP_MAX,pkgOf,bottleParts,bottleCost,dryCase,nutrientPlan,chemicals};
