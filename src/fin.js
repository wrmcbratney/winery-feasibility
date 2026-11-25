// 20-year winery feasibility engine. Annual steps, year 0 = land, engineering, build. First harvest in year 1.
// Variety presets. Washington grape prices are the Wine Commission's 2022 average by variety scaled by the
// all-variety rise to 2024 (+18%), except Cabernet (2025 actual), Merlot (2024 actual), Malbec (2024, derived) and Pinot Noir (Oregon 2025).
// pick = first pick day of year (lots follow every 2 days); soak = cold soak days, setF = ferment temperature, ext = extended maceration days after dryness.
const VARIETIES={
 'Cabernet Sauvignon':{pick:283,color:'red',grape:3170,tpa:3.5,cpt:60,brix:26,barrel:20,newOak:50,release:30,price:70,soak:3,setF:85,ext:7},
 'Merlot':{pick:268,color:'red',grape:2595,tpa:4,cpt:60,brix:25,barrel:18,newOak:35,release:28,price:50,soak:3,setF:84,ext:3},
 'Cabernet Franc':{pick:278,color:'red',grape:2450,tpa:3.5,cpt:60,brix:25,barrel:18,newOak:35,release:28,price:55,soak:3,setF:84,ext:3},
 'Petit Verdot':{pick:288,color:'red',grape:2270,tpa:3.5,cpt:58,brix:26,barrel:20,newOak:40,release:30,price:55,soak:3,setF:85,ext:5},
 'Malbec':{pick:272,color:'red',grape:1500,tpa:4,cpt:60,brix:25.5,barrel:16,newOak:30,release:26,price:45,soak:3,setF:85,ext:3},
 'Syrah':{pick:265,color:'red',grape:1580,tpa:4,cpt:60,brix:25.5,barrel:16,newOak:25,release:26,price:50,soak:2,setF:82,ext:0},
 'Grenache':{pick:276,color:'red',grape:1900,tpa:4.5,cpt:62,brix:25.5,barrel:10,newOak:0,release:18,price:40,soak:2,setF:80,ext:0},
 'Mourvedre':{pick:285,color:'red',grape:1810,tpa:4,cpt:60,brix:25,barrel:14,newOak:10,release:22,price:42,soak:2,setF:82,ext:0},
 'Sangiovese':{pick:275,color:'red',grape:1480,tpa:4.5,cpt:62,brix:24.5,barrel:12,newOak:10,release:20,price:38,soak:2,setF:84,ext:3},
 'Pinot Noir':{pick:262,color:'red',grape:2800,tpa:2.8,cpt:58,brix:24.5,barrel:11,newOak:25,release:18,price:50,soak:4,setF:82,ext:0},
 'Chardonnay':{pick:255,color:'white',grape:1200,tpa:4,cpt:62,brix:23.5,barrel:10,newOak:30,release:12,price:40},
 'Sauvignon Blanc':{pick:245,color:'white',grape:1170,tpa:5,cpt:65,brix:23,barrel:0,newOak:0,release:8,price:28},
 'Semillon':{pick:255,color:'white',grape:1630,tpa:4.5,cpt:65,brix:23,barrel:8,newOak:10,release:12,price:32},
 'Viognier':{pick:256,color:'white',grape:1360,tpa:4,cpt:62,brix:24,barrel:6,newOak:0,release:10,price:32},
 'Riesling':{pick:260,color:'white',grape:1030,tpa:5.5,cpt:68,brix:22,barrel:0,newOak:0,release:8,price:25},
 'Chenin Blanc':{pick:262,color:'white',grape:1220,tpa:5,cpt:65,brix:22.5,barrel:6,newOak:0,release:10,price:28},
 'Pinot Gris':{pick:250,color:'white',grape:1020,tpa:5,cpt:65,brix:22.5,barrel:0,newOak:0,release:8,price:25},
 'Gewurztraminer':{pick:255,color:'white',grape:860,tpa:5,cpt:65,brix:22.5,barrel:0,newOak:0,release:8,price:24}
};
// Bottling is the winemaker's call; the default is a month after barrel time ends (reds reach barrel in spring, about month 6).
const defBottle=v=>v.barrel>0?Math.round((v.color==='red'?6:0.5)+v.barrel+1):5;
for(const n in VARIETIES){const v=VARIETIES[n];v.bottle=defBottle(v);v.release=Math.max(v.release,v.bottle+2)}
const bottleOf=v=>v.bottle??defBottle(v);
const wine=(name,cases)=>({name,cases,...VARIETIES[name]});
const VDEF=[wine('Sauvignon Blanc',800),wine('Chardonnay',800),wine('Pinot Noir',800),wine('Cabernet Sauvignon',1600)];
const GDEF={
 fruit:'buy', facility:'build', tasting:true, owner:'winemaker',
 landAcre:15000, plantablePct:80, siteCoverage:12, minParcel:20, rawPrepAcre:1500, vineDevAcre:21500, farmAcre:6200, landGrowth:2.5,
 water:'district', dripAcre:3500, afPerAcre:1.8, districtAcre:150, boosterAcre:30, dryLandAcre:4000, waterRightAF:3000, rightTransfer:20000,
 irrWellDepth:500, irrWellFt:100, irrPump:40000, liftFt:400, kwh:0.09, wineryWellDepth:400, wineryWellFt:60, wineryWellKit:15000, waterRatio:4,
 fedExcise:1.07, waTaxL:0.2292, waShare:85,
 buildTier:'custom', storage:'onsite', lab:'outsource', sort:'hand', trSqft:2000, trFitout:250000, permitPct:1, sfPerKgal:35, sfPerBarrel:3, sfPerCaseStored:0.15,
 jacketGal:9, storageGal:6, hoseFt:20, harvestWindow:28, designFactor:1.15, barrelSpare:1.05, lotsPerTank:2, ozone:true, chillerTon:1800,
 barrelNew:1400, barrelUsed:400,
 suppliesCase:8, customCase:45, capHrs:0.33, crushCrew:4, bottlePerDay:1200, shiftHrs:10, generalHrs:20, harvestWeeks:8, wmHarvestHrs:45, wmCellarHrs:15, permHarvestHrs:55, cellarWage:24, seasonalWage:20, seasonalBurden:15, tankLeaseCustom:0,
 bottlePer:2.6, carton:2.5, bottling:3.5,
 wmSalary:120000, burden:25, ownerSalary:100000, adminCost:60000, trStaff:190000, trLease:60000,
 propTaxPct:1, offsiteCaseMonth:0.35, offsiteInOut:1, offsiteAdmin:3000, testsPerLot:15, testExt:40, lotTons:5, labWage:30,
 utilBase:20000, utilCase:1.5, insurePct:0.5, maintPct:1.5, marketingPct:6, dtcFeePct:3,
 shareTR:[42,28,30], shareNoTR:[10,15,75], clubDisc:15, wholesaleFactor:50,
 ramp:[35,55,75,90,100],
 loanLTV:70, loanRate:7.5, loanTerm:20, reserve:150000, distPct:75, discount:8, years:20
};
function deepCopy(o){return JSON.parse(JSON.stringify(o))}
// red tank days from the lot simulator engine
function tankDays(v,simulate){
  if(!simulate) return 18;
  const r=simulate({tons:5,brix:v.brix,yan:180,dapDay:-1,dapAmt:60,soakDays:v.soak??3,soakF:50,fruitF:65,setF:v.setF??85,coolBTU:6800,vessel:'tank',ambF:62,swingF:0,emDays:v.ext??0,yeast:'robust',
   malic:2.5,ml:'seq',mlHeat:false,mlHeatF:68,winterF:52,summerF:68,barrelF:58,harvestDOY:274,pressLoad:5,pressCycle:3,
   binTons:0.5,crushRate:8,setupHrs:1.5,sort:'hand',mustGal:180,headspace:20,freeRun:115,pressGal:45,leesPct:4,pressHandling:'blend',barrelRule:'spring',settleDays:10});
  return r.pressEnd||30;
}
const simCache={};
function redRun(v,simulate){const k=[v.brix,v.soak,v.setF,v.ext].join();if(!simCache[k])simCache[k]={days:tankDays(v,simulate)};return simCache[k]}

// Building tiers: construction $/sq ft by space, design+engineering fee, site work share.
const TIERS={
 shell:{name:'Metal building',design:8,site:5,cost:{pad:60,ferm:175,barrel:190,storage:120,lab:250,tasting:350,support:200}},
 custom:{name:'Custom production building',design:12,site:8,cost:{pad:90,ferm:275,barrel:300,storage:160,lab:350,tasting:500,support:300}},
 gravity:{name:'Gravity-flow hillside',design:18,site:22,cost:{pad:140,ferm:450,barrel:550,storage:200,lab:450,tasting:800,support:450}}
};
const LAB={
 outsource:{name:'All outside',equip:0,share:0,consum:0,hrs:0},
 basic:{name:'Basic in-house',equip:9000,share:0.6,consum:3,hrs:0.25},
 full:{name:'Full in-house',equip:45000,share:0.9,consum:6,hrs:0.15}
};
// Water: winery process water from a permit-exempt well (up to 5,000 gal/day industrial use under RCW 90.44.050),
// vineyard irrigation from an irrigation district, an on-site well with a groundwater right that comes with the land,
// or dry land plus a purchased water right and a new well.
function waterPlan(V,G,own,estate,acres,sz,FL){
  const L=[],add=(k,cap,yr,why,conf)=>L.push({k,cap,yr,why,conf});
  let wellCap=0,rights=0,transfer=0,annual=0;
  const wineGal=V.reduce((a,v)=>a+v.cases*2.378,0), procGal=wineGal*G.waterRatio;
  // harvest peak: water for the busiest processing day, roughly the peak crush-pad day's juice volume times the ratio, spread over cleanup
  let peakDay=0;if(FL)for(let d=0;d<365;d++)peakDay=Math.max(peakDay,(FL.lanes.pad[d]+FL.lanes.press[d])*G.waterRatio/2);
  if(own){const c=G.wineryWellDepth*G.wineryWellFt+G.wineryWellKit;wellCap+=c;
    add('Winery well (permit-exempt)',c,0,`${G.wineryWellDepth} ft at $${G.wineryWellFt}/ft plus pump, pressure tank and treatment. About ${Math.round(procGal).toLocaleString()} gal of process water a year at ${G.waterRatio} gal per gal of wine; busiest harvest day about ${Math.round(peakDay).toLocaleString()} gal${peakDay>5000?', over the 5,000 gal/day exempt limit, so plan storage or a water right':', inside the 5,000 gal/day exempt limit'}`,'Medium');}
  if(estate&&acres>0){
    const af=acres*G.afPerAcre;
    if(G.water==='district'){annual+=acres*(G.districtAcre+G.boosterAcre);
      add('Irrigation district assessment',0,acres*(G.districtAcre+G.boosterAcre),`$${G.districtAcre}/acre assessment plus about $${G.boosterAcre}/acre to pump drip pressure; the right comes with the land`,'Low');}
    else{
      const wc=G.irrWellDepth*G.irrWellFt+G.irrPump;wellCap+=wc;
      add('Irrigation well and pump',wc,0,`${G.irrWellDepth} ft through basalt at $${G.irrWellFt}/ft plus a pump sized for drip`,'Low');
      const kwhAF=(G.liftFt+100)*1.7, pw=af*kwhAF*G.kwh;annual+=pw+wc*0.01;
      add('Pumping power and well upkeep',0,pw+wc*0.01,`${af.toFixed(1)} acre-feet a year lifted ${G.liftFt} ft plus drip pressure, about ${Math.round(kwhAF)} kWh per acre-foot at $${G.kwh}/kWh, plus 1% upkeep`,'Low');
      if(G.water==='buyRight'){rights=af*G.waterRightAF;transfer=G.rightTransfer;
        add('Water right purchase',rights,0,`${af.toFixed(1)} acre-feet a year at $${G.waterRightAF.toLocaleString()}/AF; holds value like land`,'Medium');
        add('Water right transfer: Ecology change application, hydrogeology, legal',transfer,0,'placeholder; timing and approval are not guaranteed','Low');}
    }
    add('Drip irrigation and filtration',acres*G.dripAcre,0,`$${G.dripAcre.toLocaleString()}/acre, installed with the vineyard`,'Medium');
  }
  return {lines:L,wellCap,rights,transfer,annual,procGal,peakDay,af:estate?acres*G.afPerAcre:0};
}
// Excise: federal $1.07/gal on still wine up to 16% ABV, less the CBMA credit ($1.00 on the first 30,000 gal removed in a year,
// $0.90 on the next 100,000, $0.535 on the next 620,000). Washington $0.2292/L on wine the winery sells to Washington consumers;
// wine sold to distributors is taxed when the distributor buys it.
function exciseTax(s,G,shares){
  const gal=s.sold*2.378;if(!gal)return 0;
  let credit=Math.min(gal,30000)*1+Math.min(Math.max(gal-30000,0),100000)*0.9+Math.min(Math.max(gal-130000,0),620000)*0.535;
  const fed=Math.max(0,gal*G.fedExcise-credit);
  const dtc=(shares[0]+shares[1])/100, wa=gal*3.785*G.waTaxL*dtc*G.waShare/100;
  return fed+wa;
}
function getFlow(){return typeof flow==='function'?flow:require('./flow.js').flow}
function size(V,G,simulate,FL){
  const items=[];let red=V.filter(v=>v.color==='red'),white=V.filter(v=>v.color==='white');
  const tons=v=>v.cases/v.cpt, add=(cat,k,n,unit,each,why,conf)=>{if(n>0)items.push({cat,k,n,unit,cost:n*each,each,why,conf})};
  // Tanks and barrels are sized from the cellar flow: the most vessels in use on any day of a normal year, plus the design margin.
  const N=FL.need,S=FL.size,when=k=>{const t=new Date(2001,7,1+N[k].at);return t.toLocaleDateString('en-US',{month:'short',day:'numeric'})};
  const df=G.designFactor,mg=Math.round((df-1)*100);
  const nRed=Math.ceil(N.redTank.v*df-1e-9),tankSize=S.redTank,nW=Math.ceil(N.whiteTank.v*df-1e-9),nS=Math.ceil(N.storage.v*df-1e-9),nB=Math.ceil(N.blend.v*df-1e-9);
  const redGal=nRed*tankSize, tankCost=(gal,per)=>Math.round(per*1000*Math.pow(gal/1000,0.62)/50)*50;
  add('Tanks','Jacketed red ferment tanks',nRed,tankSize.toLocaleString()+' gal',tankCost(tankSize,G.jacketGal),`${Math.round(N.redTank.v)} in use at the peak around ${when('redTank')}, one lot each, plus ${mg}% margin`,'Medium');
  add('Tanks','Jacketed white tanks',nW,S.whiteTank.toLocaleString()+' gal',tankCost(S.whiteTank,G.jacketGal),`${Math.round(N.whiteTank.v)} in use at the peak around ${when('whiteTank')}, settling and fermenting, plus ${mg}% margin`,'Medium');
  add('Tanks','Lot tanks for ML and storage',nS,S.storage.toLocaleString()+' gal',tankCost(S.storage,G.storageGal),`${Math.round(N.storage.v)} in use at the peak around ${when('storage')}, up to ${G.lotsPerTank} lots of the same wine combined after press: reds through ML until spring, unoaked whites, wine between barrel and blending; plus ${mg}% margin`,'Medium');
  add('Tanks','Blending and bottling tanks',nB,S.blend.toLocaleString()+' gal',tankCost(S.blend,G.storageGal),`each wine comes together three weeks before bottling; ${Math.round(N.blend.v)} in use at the peak around ${when('blend')}`,'Medium');
  const allTons=V.reduce((a,v)=>a+tons(v),0), grav=G.buildTier==='gravity';
  const pressCost=allTons>60?110000:allTons>25?80000:55000;
  add('Crush and press','Membrane press',1,allTons>60?'8 ton':allTons>25?'5 ton':'3 ton',pressCost,`${allTons.toFixed(0)} tons a year`,'Medium');
  add('Crush and press','Destemmer',1,'',25000,'new; used units sell for $3k to $10k','Medium');
  add('Crush and press','Vibrating sorting table',G.sort==='none'?0:1,'',12000,'hand sorting line','High');
  add('Crush and press','Optical sorter',G.sort==='optical'?1:0,'',150000,'placeholder, no published price found','Low');
  add('Crush and press','Forklift bin tipper',1,'',8000,'dumps picking bins onto the line','Low');
  const chillTons=Math.max(10,Math.ceil(redGal/1000*3.5));
  add('Cellar','Glycol chiller',1,chillTons+' tons refrigeration',chillTons*G.chillerTon,'peak red heat plus white chilling, sized from tank volume','Low');
  add('Pumps and hoses','Must pump, 3" flexible impeller',grav?0:1,'',5500,grav?'gravity moves must from crush pad to tanks':'crush pad to tanks','High');
  add('Pumps and hoses','Wine transfer pump, 2" flexible impeller',allTons>60?2:1,'',5300,'racking, transfers, filtration','High');
  add('Pumps and hoses','Pumpover pump, centrifugal',Math.max(1,Math.ceil(nRed/4)),'',4300,'one per four red ferment tanks','Medium');
  const hoseFt=(200+25*(nRed+nW+nS+nB))*(grav?0.6:1);
  add('Pumps and hoses','Wine hose, 2" food grade',Math.round(hoseFt),'ft',G.hoseFt,grav?'shorter runs with gravity flow':'200 ft of working hose plus about 25 ft per tank','Low');
  add('Pumps and hoses','Must hose, 3"',grav?0:100,'ft',G.hoseFt*1.75,'crush pad runs','Low');
  add('Pumps and hoses','Tri-clamps, valves, gaskets, fittings',1,'',3000+150*(nRed+nW+nS),'base kit plus about $150 per tank','Low');
  const barrels=Math.ceil(N.barrel.v*G.barrelSpare-1e-9);
  add('Cellar','Barrel racks, 2-barrel steel',Math.ceil(barrels/2),'',150,'used double racks list near $120','Medium');
  add('Barrel care','Barrel washing station',barrels>0?1:0,'',3700,'rotating-jet wash and steam head on a rolling stand, run off the hot washer','High');
  add('Barrel care','Hot-water high-pressure washer',1,'',7500,'drives the barrel washer and tank cleaning; 4+ gpm at about 185°F','Low');
  add('Barrel care','Sulfur burner and SO2 gas kit',barrels>0?1:0,'',600,`keeps empty barrels sound; about ${Math.round(FL.emptyBarrelDays/365)} barrels sit empty on an average day`,'Low');
  add('Barrel care','Ozone generator',barrels>0&&G.ozone?1:0,'',6000,'sanitizing barrels and tanks without chlorine; placeholder','Low');
  add('Cellar','Forklift, electric',1,'',35000,'placeholder','Low');
  add('Cellar','Pallet jack',2,'',600,'','Medium');
  add('Cellar','Cleaning: brushes, spray balls, wash-down hoses',1,'',3000,'placeholder','Low');
  add('Cellar','Plate filter',1,'',8000,'pre-bottling; mobile bottler does sterile filtration','Low');
  const L=LAB[G.lab]||LAB.outsource;
  add('Lab',G.lab==='full'?'Lab: bench chemistry plus semi-automatic enzymatic analyzer':'Lab: pH meter, spectrophotometer, refractometer, SO2 and VA setup',L.equip?1:0,'',L.equip,G.lab==='full'?'analyzer price is a placeholder':'a minimum working lab is about $2k to $4k; this adds a spectrophotometer for YAN and malic','Medium');
  const equip=items.reduce((a,i)=>a+i.cost,0);
  return {items,equip,redGal,tankSize,allTons,nRed,nW,nS,nB,barrels,size:S,FL,tankGal:nRed*tankSize+nW*S.whiteTank+nS*S.storage+nB*S.blend};
}
function building(G,sz,peakBottled,hasLabRoom){
  const T=TIERS[G.buildTier]||TIERS.custom, sp=[];
  const addS=(k,key,sf,why)=>{if(sf>0)sp.push({k,key,sf:Math.round(sf),rate:T.cost[key],why})};
  addS('Crush pad, covered','pad',1200+10*sz.allTons,'receiving, sorting, press');
  addS('Fermentation hall','ferm',600+G.sfPerKgal*sz.tankGal/1000,`${Math.round(sz.tankGal).toLocaleString()} gal of tanks plus work area`);
  addS('Barrel room','barrel',G.sfPerBarrel*sz.barrels,`${sz.barrels} barrels, ${G.buildTier==='gravity'?'cave or below-grade room':'insulated and cooled'}`);
  addS('Case goods storage','storage',G.storage==='onsite'?G.sfPerCaseStored*peakBottled:0,G.storage==='onsite'?`peak of ${Math.round(peakBottled).toLocaleString()} bottled cases on pallets`:'');
  addS('Lab','lab',hasLabRoom?250:60,hasLabRoom?'bench lab':'sample prep only');
  addS('Tasting room and hospitality','tasting',G.tasting?G.trSqft:0,'');
  const sub=sp.reduce((a,s)=>a+s.sf,0);
  addS('Offices, restrooms, mechanical','support',sub*0.12,'about 12% of the rest');
  sp.forEach(s=>{s.build=s.sf*s.rate;s.design=s.build*T.design/100});
  const build=sp.reduce((a,s)=>a+s.build,0), design=sp.reduce((a,s)=>a+s.design,0);
  const site=build*T.site/100, permits=build*G.permitPct/100;
  return {T,spaces:sp,sqft:sp.reduce((a,s)=>a+s.sf,0),build,design,site,permits,total:build+design+site+permits};
}
// Workload-based labor. Hours per year at steady state, split into the harvest window and the rest of the year.
// Workload-based labor, from the daily cellar calendar in flow.js (work()). A normal year is days 0 to 364.
const TASK_WHY={crush:'pick days: crew setup, bins, forklift and sanitation, plus sorting hours per ton',press:'two people through each press load plus cleanup',cap:'twice a day per red lot while it is in tank',checks:'Brix and temperature, nutrients, SO2: a quarter hour per lot a day',moves:'pumping between vessels, tank cleaning, lot-tank work',barrel:'filling, monthly topping, a mid-term racking, washing on the way out',bottling:'six people beside a mobile line',cases:'pallets, club shipments, pickups, spread over each wine\'s selling year',general:'daily rounds in harvest, routine cleaning and records otherwise, sulfuring empty barrels'};
function getWork(){return typeof work==='function'?work:require('./flow.js').work}
function getTasks(){return typeof TASKS!=='undefined'?TASKS:require('./flow.js').TASKS}
function labor(V,G,sz,lab,simulate,FL){
  const WK=getWork()(FL,V,G,sz),TK=getTasks(),Tsum=new Float64Array(365);
  for(let d=0;d<365;d++)for(const [k] of TK)Tsum[d]+=WK.T[k][d];
  let hDays=0;for(let d=0;d<365;d++)hDays+=WK.active[d];
  const hW=hDays/7,yW=52-hW,tasks=[];
  TK.forEach(([k,name])=>{let h=0,y=0;for(let d=0;d<365;d++)(WK.active[d]?(h+=WK.T[k][d]):(y+=WK.T[k][d]));
    if(h>0.5)tasks.push({season:'harvest',k:name,hrs:h,why:TASK_WHY[k]});if(y>0.5)tasks.push({season:'year',k:name,hrs:y,why:TASK_WHY[k]})});
  let H=0,Yh=0;for(let d=0;d<365;d++)(WK.active[d]?(H+=Tsum[d]):(Yh+=Tsum[d]));
  const wmH=hW*G.wmHarvestHrs, wmY=yW*G.wmCellarHrs;
  const yRest=Math.max(0,Yh-wmY);
  const perms=Math.floor(yRest/(yW*40)+0.4);
  const partHrs=Math.max(0,yRest-perms*yW*40);
  const otHrs=perms*hW*Math.max(0,G.permHarvestHrs-40);
  // seasonal crew fills each harvest day's shortfall; headcount from the busiest week
  const base=(G.wmHarvestHrs+perms*G.permHarvestHrs)/7, short=new Float64Array(365);let seasonalHrs=0;
  for(let d=0;d<365;d++)if(WK.active[d]){short[d]=Math.max(0,Tsum[d]-base);seasonalHrs+=short[d]}
  let pk7=0;for(let d=0;d<365;d++){let s=0;for(let i=0;i<7;i++)s+=short[(d+i)%365];pk7=Math.max(pk7,s/7)}
  const seasonalHeads=Math.ceil(pk7/(50/7)-1e-9);
  const avail=new Float64Array(365),offRate=(G.wmCellarHrs+perms*40)/7+(yW>0?partHrs/(yW*7):0);
  for(let d=0;d<365;d++)avail[d]=WK.active[d]?base+seasonalHeads*50/7:offRate;
  const b=1+G.burden/100;
  const cost={perm:perms*G.cellarWage*2080*b,ot:otHrs*G.cellarWage*0.5*b,part:partHrs*G.cellarWage*(1+G.seasonalBurden/100),seasonal:seasonalHrs*G.seasonalWage*(1+G.seasonalBurden/100)};
  const total=Object.values(cost).reduce((a,c)=>a+c,0);
  let peakDay=0;for(let d=0;d<365;d++)peakDay=Math.max(peakDay,Tsum[d]);
  return {tasks,harvestHrs:H,yearHrs:Yh,wmH,wmY,perms,partHrs,otHrs,seasonalHrs,seasonalHeads,cost,total,peakWeek:hW?H/hW:0,harvestWeeks:hW,peakDay,avail,WK};
}
function model(Vin,Gin,simulate){
  const V=deepCopy(Vin),G=deepCopy(Gin),Y=G.years;
  const tons=v=>v.cases/v.cpt;
  const totCases=V.reduce((a,v)=>a+v.cases,0), allTons=V.reduce((a,v)=>a+tons(v),0);
  const estate=G.fruit==='estate', own=G.facility==='build';
  if(!own)G.storage='offsite';
  const acres=estate?V.reduce((a,v)=>a+tons(v)/v.tpa,0):0;
  const bearing=y=>y<3?0:y===3?0.3:y===4?0.7:1;
  const FL=getFlow()(V,G,simulate);
  const sz=own?size(V,G,simulate,FL):{items:[],equip:0,barrels:0};
  // ---- lab program ----
  const lots=V.reduce((a,v)=>a+Math.max(1,Math.ceil(tons(v)/G.lotTons)),0);
  const tests=lots*G.testsPerLot, L=LAB[own?G.lab:'outsource'];
  const outShare=own?1-L.share:0.5; // custom crush covers about half of routine testing in its fee
  const labYear=tests*(outShare*G.testExt+(own?L.share:0)*(L.consum+L.hrs*G.labWage));
  const lab={lots,tests,outTests:tests*outShare,inTests:own?tests*L.share:0,cost:labYear,equip:L.equip,name:own?L.name:'Custom crush plus outside lab'};
  const lbr=own?labor(V,G,sz,lab,simulate,FL):null, laborCase=own?lbr.total/totCases:0;
  // ---- vintages and sales first; the building is sized from them ----
  const vint=[];const yearCost={fruit:Array(Y+1).fill(0),prod:Array(Y+1).fill(0),barrels:Array(Y+1).fill(0),dry:Array(Y+1).fill(0),farm:Array(Y+1).fill(0)};
  for(let y=1;y<=Y;y++){
    V.forEach((v,i)=>{
      const t=tons(v), estT=estate?t*bearing(y):0, buyT=t-estT;
      const fruit=buyT*v.grape, farm=estate&&bearing(y)>0?(t/v.tpa)*G.farmAcre:0;
      const prod=own?v.cases*(G.suppliesCase+laborCase):v.cases*G.customCase;
      const bbl=v.barrel>0?v.cases*2.4/59.4:0, newShare=v.newOak/100;
      const stock=v.barrel>0?FL.bPeak[i]*G.barrelSpare:0;
      const barrelCost=y===1?stock*(newShare*G.barrelNew+(1-newShare)*G.barrelUsed):bbl*(newShare*G.barrelNew+Math.max(0,0.2-newShare)*G.barrelUsed);
      const dry=v.cases*(G.bottlePer*12+G.carton+G.bottling);
      const relYear=y+Math.floor((9.5+v.release)/12), botYear=y+Math.floor((9.5+Math.min(bottleOf(v),v.release))/12);
      yearCost.fruit[y]+=fruit;yearCost.farm[y]+=farm;yearCost.prod[y]+=prod;yearCost.barrels[y]+=barrelCost;if(botYear<=Y)yearCost.dry[botYear]+=dry;
      vint.push({i,y,relYear,botYear,cases:v.cases,left:v.cases,cost:(fruit+farm+prod+barrelCost+dry)/v.cases});
    });
  }
  const shares=G.tasting?G.shareTR:G.shareNoTR;
  const netFactor=(shares[0]+shares[1]*(1-G.clubDisc/100)+shares[2]*G.wholesaleFactor/100)/100;
  const firstRel=V.map(v=>1+Math.floor((9.5+v.release)/12));
  const sales=[];
  for(let y=0;y<=Y;y++){
    let rev=0,cogs=0,sold=0,dtcRev=0;
    V.forEach((v,i)=>{
      const k=y-firstRel[i]; if(k<0)return;
      let cap=v.cases*(G.ramp[Math.min(k,G.ramp.length-1)]/100);
      for(const vt of vint){if(vt.i!==i||vt.relYear>y||vt.left<=0||cap<=0)continue;const q=Math.min(vt.left,cap);vt.left-=q;cap-=q;sold+=q;
        rev+=q*12*v.price*netFactor;dtcRev+=q*12*v.price*(shares[0]+shares[1]*(1-G.clubDisc/100))/100;cogs+=q*vt.cost}
    });
    const inv=vint.filter(vt=>vt.y<=y).reduce((a,vt)=>a+vt.left,0);
    const bottled=vint.filter(vt=>vt.botYear<=y).reduce((a,vt)=>a+vt.left,0);
    const bottledIn=vint.filter(vt=>vt.botYear===y).reduce((a,vt)=>a+vt.cases,0);
    const invCost=vint.filter(vt=>vt.y<=y).reduce((a,vt)=>a+vt.left*vt.cost,0);
    sales.push({rev,cogs,sold,dtcRev,inv,bottled,bottledIn,invCost});
  }
  const peakBottled=Math.max(...sales.map(s=>s.bottled));
  // ---- facility ----
  const hasLabRoom=own&&G.lab!=='outsource';
  const bld=own?building(G,sz,peakBottled,hasLabRoom):{spaces:[],sqft:0,build:0,design:0,site:0,permits:0,total:0,T:TIERS[G.buildTier]};
  const capex=Array(Y+1).fill(0),capLines=[];
  const addCap=(y,amt,label)=>{if(y<=Y&&amt){capex[y]+=amt;capLines.push({y,amt,label})}};
  // ---- land: planted acres grossed up for roads, headlands and unplantable ground, plus the winery site, at least the zoning minimum ----
  const vineGross=acres/(G.plantablePct/100);
  const siteAcres=own?Math.max(1,bld.sqft/(G.siteCoverage/100)/43560)*(G.buildTier==='gravity'?1.5:1):(G.tasting?0:0);
  const need=vineGross+siteAcres, landAcres=need>0?Math.max(need,G.minParcel):0, spare=landAcres-need;
  // irrigated farmland only matters if there's a vineyard watered with the land's own right; otherwise the parcel can be dry ground
  const priceAcre=estate&&G.water!=='buyRight'?G.landAcre:G.dryLandAcre;
  const LD={planted:acres,vineGross,siteAcres,need,bought:landAcres,spare,priceAcre,unplantable:vineGross-acres};
  // ---- water ----
  const W=waterPlan(V,G,own,estate,acres,sz,FL);
  const prep=estate&&G.water==='buyRight'?vineGross*G.rawPrepAcre:0;
  const land=landAcres*priceAcre+W.rights; addCap(0,land-W.rights,'Land');addCap(0,prep,'Clearing raw ground');
  addCap(0,W.rights,'Water rights');addCap(0,W.wellCap+W.transfer,'Wells and water rights work');
  addCap(0,bld.design,'Design and engineering');addCap(0,bld.site+bld.permits,'Site work and permits');addCap(0,bld.build,'Construction');
  if(!own&&G.tasting)addCap(0,G.trFitout*0.4,'Leased tasting room fit-out');
  addCap(0,sz.equip,'Cellar equipment'); addCap(10,sz.equip*0.5,'Equipment replacement');
  const vineDev=acres*(G.vineDevAcre+G.dripAcre); [0.6,0.25,0.15].forEach((f,i)=>addCap(i,vineDev*f,'Vineyard development'));
  for(let y=1;y<=2;y++)addCap(y,acres*G.farmAcre,'Pre-bearing farming');
  // ---- years ----
  const rows=[];
  for(let y=0;y<=Y;y++){
    const s=sales[y], b=1+G.burden/100;
    const staff={
      winemaker:y>=1&&G.owner==='hire'?G.wmSalary*b:0,
      owner:G.owner==='winemaker'?G.ownerSalary:0,
      admin:y>=1?G.adminCost:0,
      tasting:G.tasting&&y>=Math.min(...firstRel)?G.trStaff:0
    };
    const assessed=land*Math.pow(1+G.landGrowth/100,y)+(y>=0?bld.build+bld.design+bld.site+sz.equip:0);
    const fixed={
      lease:G.tasting&&!own&&y>=Math.min(...firstRel)?G.trLease:0,
      util:y>=1?G.utilBase+G.utilCase*totCases*(own?1:0.2):0,
      insure:(capex.slice(0,y+1).reduce((a,c)=>a+c,0))*G.insurePct/100,
      maint:own&&y>=1?(bld.build+sz.equip)*G.maintPct/100:0,
      marketing:s.rev*G.marketingPct/100+(y>=1?15000:0),
      fees:s.dtcRev*G.dtcFeePct/100,
      propTax:assessed*G.propTaxPct/100,
      storage:G.storage==='offsite'&&s.bottled+s.bottledIn>0?s.bottled*12*G.offsiteCaseMonth+(s.bottledIn+s.sold)*G.offsiteInOut/2+G.offsiteAdmin:0,
      lab:y>=1?lab.cost:0,
      water:y>=1?W.annual:0,
      excise:exciseTax(s,G,shares)
    };
    const opex=Object.values(staff).reduce((a,c)=>a+c,0)+Object.values(fixed).reduce((a,c)=>a+c,0);
    const prodCash=yearCost.fruit[y]+yearCost.farm[y]+yearCost.prod[y]+yearCost.barrels[y]+yearCost.dry[y];
    rows.push({y,...s,staff,fixed,opex,prodCash,capex:capex[y],gross:s.rev-s.cogs});
  }
  const dep=Array(Y+1).fill(0);
  for(let y=1;y<=Y;y++){dep[y]+=(bld.build+bld.design+bld.site+bld.permits)/30+sz.equip/10+(!own&&G.tasting?G.trFitout*0.4/10:0);if(y>=11)dep[y]+=sz.equip*0.5/10;if(estate&&y>=3)dep[y]+=(vineDev+2*acres*G.farmAcre)/25}
  rows.forEach(r=>{r.ebitda=r.rev-r.cogs-r.opex;r.dep=dep[r.y];r.ebit=r.ebitda-r.dep});
  const eligible=capex.slice(0,3).reduce((a,c)=>a+c,0);
  const building0=bld.build+bld.design+bld.site+bld.permits;
  const fin={cash:finance(rows,G,0,land,building0,sz,acres,vineDev),loan:finance(rows,G,eligible*G.loanLTV/100,land,building0,sz,acres,vineDev)};
  return {rows,fin,sz,bld,lab,lbr,FL,W,LD,acres,landAcres,land,capexTotal:capex.reduce((a,c)=>a+c,0),capLines,netFactor,totCases,allTons,firstRel,peakBottled,V,G};
}
function finance(rows,G,loanAmt,land,building,sz,acres,vineDev){
  const Y=G.years, r=G.loanRate/100, n=G.loanTerm;
  const pmt=loanAmt>0?loanAmt*r/(1-Math.pow(1+r,-n)):0;
  let bal=loanAmt,cash=0,cum=0,equityTot=0;const out=[];
  for(const row of rows){
    const y=row.y;
    const interest=bal*r, principal=y>=1&&bal>0?Math.min(bal,pmt-interest):0;
    const intPaid=y>=1?interest:0; // interest during build year capitalized into the draw, kept simple
    const cfo=row.rev-row.opex-row.prodCash-intPaid;
    const draw=y===0?loanAmt:0;
    let c=cash+cfo-row.capex+draw-principal;
    let equity=0; if(c<G.reserve){equity=G.reserve-c;c=G.reserve}
    let dist=0; const ds=pmt;
    const dscr=y>=1&&ds>0?(row.rev-row.opex-row.prodCash)/ds:null;
    if(y>=2&&cfo>0&&c>G.reserve*2&&equity===0){dist=(c-G.reserve*2)*G.distPct/100;c-=dist}
    bal-=principal; cash=c; equityTot+=equity;
    const ownerSal=row.staff.owner;
    const ownerCF=-equity+dist+ownerSal;
    cum+=ownerCF;
    const ebt=row.ebit-intPaid;
    out.push({y,cfo,equity,dist,ownerSal,ownerCF,cum,cash,bal,interest:intPaid,principal,dscr,ebt});
  }
  // terminal value at year Y: land appreciated + undepreciated assets + inventory at cost + cash - debt
  const last=rows[rows.length-1];
  const landVal=land*Math.pow(1+G.landGrowth/100,Y);
  const bookBuild=Math.max(0,building)*(1-Y/30)+sz.equip*0.5*(1-(Y-10)/10)+(acres?(vineDev)*(1-(Y-3)/25):0);
  const tv=landVal+bookBuild+last.invCost+cash-bal;
  const flows=out.map(o=>o.ownerCF);flows[Y]+=tv;
  const irr=IRR(flows), npv=flows.reduce((a,f,i)=>a+f/Math.pow(1+G.discount/100,i),0);
  const firstProfit=out.find(o=>o.y>=1&&o.ebt>0&&out.slice(o.y).every(p=>p.ebt>0));
  const payback=out.find(o=>o.cum>=0&&o.y>0&&out.slice(o.y).every(p=>p.cum>=0));
  const late=out.filter(o=>o.y>Y-10);
  return {out,loanAmt,pmt,equityTot,peak:-Math.min(...out.map(o=>o.cum)),tv,irr,npv,firstProfit:firstProfit?firstProfit.y:null,payback:payback?payback.y:null,
    avgPayout:late.reduce((a,o)=>a+o.dist+o.ownerSal,0)/late.length,
    minDscr:(()=>{const s=rows.findIndex(r=>r.sold>=0.9*rows[rows.length-1].sold&&r.y>0);const d=out.filter(o=>o.dscr!=null&&o.y>=s).map(o=>o.dscr);return d.length?Math.min(...d):null})(),
    weakYears:out.filter(o=>o.dscr!=null&&o.dscr<1.25).length};
}
function IRR(f){let lo=-0.99,hi=1;const npv=r=>f.reduce((a,c,i)=>a+c/Math.pow(1+r,i),0);if(npv(lo)*npv(hi)>0)return null;for(let k=0;k<100;k++){const m=(lo+hi)/2;if(npv(lo)*npv(m)<=0)hi=m;else lo=m}return (lo+hi)/2}
if(typeof module!=='undefined')module.exports={model,VDEF,GDEF,size,TIERS,LAB,VARIETIES,labor};
