// Steady-state cellar flow: every lot of several overlapping vintages, day by day, by location, in gallons and vessels.
// Day 0 = Aug 1 of the harvest year. Vintages k=-3..1 are identical and offset by 365 days, so days 0 to 364
// are a normal year once the brand is running, with older vintages still in barrel or bottle.
const LOCS=[['pad','Crush pad'],['press','Press'],['redTank','Red ferment tanks'],['whiteTank','White tanks'],['storage','Lot tanks: ML and storage'],['blend','Blending and bottling tanks'],['barrel','Barrels'],['bottled','Bottled, not yet sold']];
const UNIT={pad:['bin','bins'],press:['press load','press loads'],redTank:['tank','tanks'],whiteTank:['tank','tanks'],storage:['tank','tanks'],blend:['tank','tanks'],barrel:['barrel','barrels'],bottled:['pallet','pallets']};
const AUG1=213, MIDOCT=288-213, MO=30.44, GAL_CASE=2.378, BBL=59.4, STD_TANK=[500,750,1000,1500,2000,2500,3000,4000,5000,6000,8000];
const flowCache={};
function lotSim(v,tons,pick,simulate){
  const k=[v.brix,v.soak,v.setF,v.ext,pick,tons.toFixed(2)].join();
  if(!flowCache[k])flowCache[k]=simulate({tons,brix:v.brix,yan:180,dapDay:-1,dapAmt:60,soakDays:v.soak??3,soakF:50,fruitF:65,setF:v.setF??85,coolBTU:6800,vessel:'tank',ambF:62,swingF:0,emDays:v.ext??0,yeast:'robust',
   malic:2.5,ml:'seq',mlHeat:false,mlHeatF:68,winterF:52,summerF:68,barrelF:58,harvestDOY:pick,pressLoad:5,pressCycle:3,
   binTons:0.5,crushRate:8,setupHrs:1.5,sort:'hand',mustGal:180,headspace:20,freeRun:115,pressGal:45,leesPct:4,pressHandling:'blend',barrelRule:'spring',settleDays:10});
  return flowCache[k];
}
function lotPlan(V,G,simulate){
  const lots=[], short={}, allTons=V.reduce((a,v)=>a+v.cases/v.cpt,0), pressT=allTons>60?8:allTons>25?5:3;
  V.forEach((v,wi)=>{
    const tons=v.cases/v.cpt, n=Math.max(1,Math.ceil(tons/G.lotTons-1e-9)), lt=tons/n, cases=v.cases/n;
    const bm=Math.min(v.bottle??(v.barrel>0?Math.round((v.color==='red'?6:0.5)+v.barrel+1):5),v.release),bottle=MIDOCT+bm*MO, release=MIDOCT+v.release*MO;
    for(let j=0;j<n;j++){
      const pick=(v.pick??270)+j*2, p=pick-AUG1, S=[];
      const seg=(loc,a,b,gal,units,x)=>{if(b>a)S.push({loc,a:p+a,b:p+b,gal,units,...x})};
      const ev=(loc,a,gal,units)=>S.push({loc,a:p+a,b:p+a+1,gal,units,ev:true});
      const bot=bottle-p, rel=release-p, bl=bot-21, wineGal=v.cases*GAL_CASE*1.03, bins=Math.ceil(lt/0.5-1e-9), loads=Math.ceil(lt/pressT-1e-9);
      if(v.color==='red'){
        const r=lotSim(v,lt,pick,simulate);
        const pressDay=r.pressDay??20, pressEnd=r.pressEnd??20.2, gal=r.gal??lt*160, bg=r.barrelGal??gal*0.96;
        const barrelDay=Math.min(r.barrelDay??200,bot-30);
        ev('pad',0,r.mustGal,bins);seg('redTank',0,pressEnd,r.tankGal);ev('press',Math.floor(pressDay),gal,loads);
        if(v.barrel>0){seg('storage',pressEnd,barrelDay,gal);let out=Math.min(barrelDay+v.barrel*MO,bl);if(barrelDay+v.barrel*MO>bl+7)short[wi]=(bl-barrelDay)/MO;if(bl-out<60)out=bl;seg('barrel',barrelDay,out,bg,Math.ceil(bg/BBL-1e-9));seg('storage',out,bl,bg)}
        else seg('storage',pressEnd,bl,gal);
        seg('blend',bl,bot,bg,null,{wine:wineGal,n});
      }else{
        const juice=lt*170;
        ev('pad',0,lt*180,bins);ev('press',0,juice,loads);seg('whiteTank',0,2,juice*1.1);
        if(v.barrel>0){let out=Math.min(2+v.barrel*MO,bl);if(2+v.barrel*MO>bl+7)short[wi]=(bl-2)/MO;if(bl-out<60)out=bl;seg('barrel',2,out,juice*0.96,Math.ceil(juice*0.96/BBL-1e-9));seg('storage',out,bl,juice*0.94)}
        else{seg('whiteTank',2,21,juice*1.1);seg('storage',21,bl,juice*0.96)}
        seg('blend',bl,bot,juice*0.94,null,{wine:wineGal,n});
      }
      const bg=cases*GAL_CASE;
      seg('bottled',bot,rel,bg,cases/56);
      for(let q=0;q<12;q++){const f=1-(q+0.5)/12;seg('bottled',rel+q*MO,rel+(q+1)*MO,bg*f,cases*f/56)}
      const rr=v.color==='red'?lotSim(v,lt,pick,simulate):null;
      lots.push({wi,name:v.name,j,n,tons:lt,cases,wineCases:v.cases,pick,p,color:v.color,segs:S,bottle,release,bins,loads,
        crushHrs:rr?(rr.crushHrs??lt/8+1.5):lt/8+0.5,pressHrs:rr?(rr.pressHrs??loads*3):loads*3.5,mustGal:lt*180});
    }
  });
  return {lots,pressT,short};
}
function flow(V,G,simulate){
  const {lots:base,pressT,short}=lotPlan(V,G,simulate), kk=Math.max(1,G.lotsPerTank||1), D=365*4;
  // one tank size per tank type: the smallest standard size that holds the largest lot there
  const size={};['redTank','whiteTank','storage','blend'].forEach(k=>{const mx=Math.max(0,...base.flatMap(l=>l.segs.filter(s=>s.loc===k).map(s=>k==='blend'?Math.min(s.wine,8000):k==='storage'?s.gal*Math.min(kk,l.n):s.gal)));size[k]=STD_TANK.find(s=>s>=mx)||STD_TANK[STD_TANK.length-1]});
  base.forEach(l=>l.segs.forEach(s=>{if(s.loc==='storage')s.units=1/Math.min(kk,l.n);else if(s.units==null)s.units=s.loc==='blend'?Math.ceil(s.wine/size.blend-1e-9)/s.n:Math.ceil(s.gal/size[s.loc]-1e-9)}));
  const mk=()=>{const o={};LOCS.forEach(([k])=>o[k]=new Float64Array(D));return o};
  const lanes=mk(),lanes0=mk(),ves=mk(),ves0=mk(),bWine=V.map(()=>new Float64Array(D)),grp={};
  for(let k=-3;k<=1;k++)base.forEach(L=>L.segs.forEach(s=>{
    const a=s.a+365*k,b=s.b+365*k;
    for(let d=Math.max(0,Math.floor(a));d<Math.min(D,Math.ceil(b));d++){
      const w=s.ev?1:Math.min(b,d+1)-Math.max(a,d);if(w<=0)continue;
      lanes[s.loc][d]+=s.gal*w;if(k===0)lanes0[s.loc][d]+=s.gal*w;
      // a vessel counts as in use on any day it holds wine, so on a transfer day both vessels count
      const u=s.loc==='bottled'?s.units*w:s.units;
      if(s.loc==='storage'){if(u){const g=grp[L.wi+'|'+k]||(grp[L.wi+'|'+k]=new Float64Array(D));g[d]+=u}}else{ves[s.loc][d]+=u;if(k===0)ves0[s.loc][d]+=u;}
      if(s.loc==='barrel'&&u)bWine[L.wi][d]+=u;
    }
  }));
  for(const key in grp){const g=grp[key],k0=key.endsWith('|0');for(let d=0;d<D;d++)if(g[d]>0){const n=Math.ceil(g[d]-1e-9);ves.storage[d]+=n;if(k0)ves0.storage[d]+=n}}
  const peak=(a)=>{let mx=0,at=0;for(let d=0;d<365;d++)if(a[d]>mx){mx=a[d];at=d}return{v:mx,at}};
  const need={};LOCS.forEach(([k])=>need[k]=peak(ves[k]));
  const bPeak=bWine.map(a=>peak(a).v);
  const end=Math.max(...base.map(L=>L.release+365));
  const installedB=Math.ceil(need.barrel.v*(G.barrelSpare||1.05)-1e-9);let emptyBarrelDays=0;for(let d=0;d<365;d++)emptyBarrelDays+=Math.max(0,installedB-ves.barrel[d]);
  return {lots:base,lanes,lanes0,ves,ves0,size,need,bPeak,pressT,D,end,short,emptyBarrelDays};
}

// Daily cellar work and equipment time, built lot by lot from the same calendar as the flow.
const TASKS=[['crush','Crush days and sorting'],['press','Pressing'],['cap','Pumpovers and punchdowns'],['checks','Ferment checks and additions'],['moves','Transfers, racking, tank cleaning'],['barrel','Barrel work'],['bottling','Bottling'],['cases','Case goods and shipping'],['general','Rounds, cleaning, upkeep']];
const EQUIP=[['crushline','Sorting and destemming line'],['press','Press'],['mustpump','Must pump'],['popump','Pumpover pumps'],['xfer','Transfer pumps'],['washer','Barrel washer'],['bottler','Mobile bottling line'],['forklift','Forklift']];
function work(FL,V,G,sz){
  const D=FL.D,mk=K=>Object.fromEntries(K.map(([k])=>[k,new Float64Array(D)]));
  const T=mk(TASKS),T0=mk(TASKS),E=mk(EQUIP),E0=mk(EQUIP);
  const sortH={none:1,hand:2.5,optical:1.3}[G.sort]||2.5,grav=G.buildTier==='gravity',GPH=3000,perHr=G.bottlePerDay/8;
  const put=(A,A0,key,d,h,k)=>{d=Math.floor(d);if(d<0||d>=D||!(h>0))return;A[key][d]+=h;if(k===0)A0[key][d]+=h};
  const spread=(A,A0,key,a,b,h,k)=>{if(!(h>0))return;for(let d=Math.max(0,Math.floor(a));d<Math.min(D,Math.ceil(b));d++){const w=Math.min(b,d+1)-Math.max(a,d);if(w>0){A[key][d]+=h*w;if(k===0)A0[key][d]+=h*w}}};
  for(let k=-3;k<=1;k++){const o=365*k;FL.lots.forEach(L=>{
    const S=L.segs,red=L.color==='red',p=L.p+o;
    put(T,T0,'crush',p,G.crushCrew*6+L.tons*(red?sortH:0.8),k);
    put(E,E0,'crushline',p,red?L.crushHrs:0,k);put(E,E0,'forklift',p,L.bins*0.1,k);
    if(red&&!grav)put(E,E0,'mustpump',p,L.mustGal/GPH+1,k);
    const ps=S.find(s=>s.loc==='press');if(ps){put(E,E0,'press',ps.a+o,L.pressHrs,k);put(T,T0,'press',ps.a+o,2*L.pressHrs+2*L.loads,k)}
    S.filter(s=>s.loc==='redTank').forEach(s=>{spread(T,T0,'cap',s.a+o,s.b+o,2*G.capHrs,k);spread(E,E0,'popump',s.a+o,s.b+o,0.5,k);spread(T,T0,'checks',s.a+o,s.b+o,0.25,k)});
    if(!red)spread(T,T0,'checks',p+2,p+20,0.25,k);
    const ws=S.filter(s=>!s.ev&&s.loc!=='bottled').sort((x,y)=>x.a-y.a);
    for(let i=1;i<ws.length;i++){const fr=ws[i-1],to=ws[i],d=to.a+o;
      put(E,E0,'xfer',d,grav&&to.loc==='barrel'?0.25:to.gal/GPH+0.5,k);put(T,T0,'moves',d,2+(fr.loc==='barrel'?0:2),k);
      if(to.loc==='barrel')put(T,T0,'barrel',d,to.units*0.1,k);
      if(fr.loc==='barrel'){put(E,E0,'washer',d,fr.units*0.15,k);put(T,T0,'barrel',d,fr.units*0.25,k)}}
    S.filter(s=>s.loc==='barrel').forEach(s=>{spread(T,T0,'barrel',s.a+o,s.b+o,s.units*1.5/365,k);
      if(s.b-s.a>120){const m=(s.a+s.b)/2+o;put(T,T0,'barrel',m,s.units*0.4,k);put(E,E0,'xfer',m,s.units*BBL/GPH+1,k);put(E,E0,'washer',m,s.units*0.15,k)}});
    S.filter(s=>s.loc==='storage').forEach(s=>spread(T,T0,'moves',s.a+o,s.b+o,s.units*20/365,k));
    const bot=L.bottle+o,bd=Math.max(1,Math.ceil(L.wineCases/G.bottlePerDay-1e-9)),lh=L.cases/perHr;
    spread(T,T0,'bottling',bot,bot+bd,(6*lh+4/L.n)/bd,k);spread(E,E0,'bottler',bot,bot+bd,lh/bd,k);spread(E,E0,'forklift',bot,bot+bd,L.cases/56*0.1/bd,k);
    put(T,T0,'moves',bot,2,k);
    spread(T,T0,'cases',L.release+o,L.release+o+365,L.cases*0.03/365,k);
  })}
  const inst=sz&&sz.barrels||0,active=new Uint8Array(D);
  for(let d=0;d<D;d++){active[d]=FL.lanes.redTank[d]+FL.lanes.whiteTank[d]>0?1:0;
    const empty=Math.max(0,inst-FL.ves.barrel[d])*0.1/42, g=(active[d]?6:G.generalHrs/7)+empty;
    T.general[d]+=g;T0.general[d]+=g}
  const units={crushline:1,press:1,mustpump:grav?0:1,popump:Math.max(1,Math.ceil((sz&&sz.nRed||4)/4)),xfer:(sz&&sz.allTons>60)?2:1,washer:inst?1:0,bottler:1,forklift:1};
  return {T,T0,E,E0,active,units};
}
if(typeof module!=='undefined')module.exports={flow,lotPlan,work,LOCS,UNIT,TASKS,EQUIP,AUG1,MO};
