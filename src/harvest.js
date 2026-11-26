// Harvest: from the expected arrival of fruit to fermentors filled. The stages are kept apart because they are different
// things and will change separately:
//   1. expected arrival: a curve per fruit source (today one source per variety; later vineyards or blocks)
//   2. deliveries: the fruit that actually arrives, day by day, mass exact
//   3. receiving: picking bins, a container count kept separate from fruit mass
//   4. filling: deliveries go into fermentors under the color's fill policy; one filled fermentor is one lot
// Everything downstream consumes deliveries, never the curve, so a manual schedule or another curve shape plugs in.

// Standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7).
function normCdf(x){const z=Math.abs(x)/Math.SQRT2,t=1/(1+0.3275911*z),y=1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-z*z);return x>=0?(1+y)/2:(1-y)/2}

// 1. A fruit source. For now one per wine row, named for its variety; the id is what deliveries and lots refer to.
function sourcesOf(V){return V.map((v,wi)=>({id:`${wi}:${v.name}`,wi,name:v.name,color:v.color,tons:v.cases/v.cpt,pick:v.pick??270,pickSD:v.pickSD??2,schedule:Array.isArray(v.schedule)?v.schedule:null}))}

// Expected arrival (VEN 235): each day gets the area under the source's normal curve for that day. Exact mass: the days
// are rescaled so they sum to the source's tons, so the curve neither makes nor loses fruit.
function expectedArrival(src,G){
  const mu=src.pick,sd=src.pickSD*(G.harvestSpread??1);
  if(!(sd>0))return [{day:Math.round(mu),tons:src.tons}];
  const out=[];for(let d=Math.floor(mu-4.5*sd);d<=Math.ceil(mu+4.5*sd);d++){const t=normCdf((d+0.5-mu)/sd)-normCdf((d-0.5-mu)/sd);if(t>0)out.push({day:d,tons:t})}
  const s=out.reduce((a,e)=>a+e.tons,0);out.forEach(e=>e.tons*=src.tons/s);
  return out;
}

// 2. Deliveries. A generated schedule is what a grower would bring: any day carrying less than the minimum delivery
// hands its fruit to the neighboring day toward the middle of the curve, until every day carries at least the minimum.
// Mass is conserved and every move is recorded (from), so the change in timing is visible. A manual schedule is taken
// as given, smaller deliveries included.
function deliveriesFor(src,G){
  if(src.schedule)return src.schedule.filter(d=>d.tons>0).map(d=>({source:src.id,wi:src.wi,name:src.name,color:src.color,day:d.day,tons:d.tons,from:[{day:d.day,tons:d.tons}],manual:true}));
  const a=expectedArrival(src,G).map(e=>({day:e.day,tons:e.tons,from:[{day:e.day,tons:e.tons}]})),min=G.minDelivery??0.25;
  while(a.length>1){
    let i=0;for(let k=1;k<a.length;k++)if(a[k].tons<a[i].tons)i=k;
    if(a[i].tons>=min-1e-12)break;
    let pk=0;for(let k=1;k<a.length;k++)if(a[k].tons>a[pk].tons)pk=k;
    const t=i<pk?i+1:i>pk?i-1:(i+1<a.length?i+1:i-1);
    a[t].tons+=a[i].tons;a[t].from.push(...a[i].from);a.splice(i,1);
  }
  return a.map(e=>({source:src.id,wi:src.wi,name:src.name,color:src.color,day:e.day,tons:e.tons,from:e.from,manual:false}));
}

// 3. Receiving: a picking bin is a container with a capacity, not a unit of fruit. A delivery fills whole bins and at
// most one partial bin; bins are counted here, once, however the fruit is later divided.
function binsOf(tons,G){const cap=G.binTons??0.5,full=Math.floor(tons/cap+1e-9),rest=tons-full*cap;return {bins:full+(rest>1e-9?1:0),full,partial:rest>1e-9?1:0,partialTons:rest>1e-9?rest:0}}

// 4. Filling, by color. A fermentor is reserved from its first fruit. Reds: the cold soak program runs from the first
// fruit, inoculation follows it, and fresh fruit may go in until the normal addition window after inoculation closes.
// Whites: juice settles, then is inoculated, with the same addition window. A fermentor closes when full or when its
// window closes; it is never held open to reach a fill target. A red fermentor that closes below the preferred minimum
// fill, or below the practical warning level, is reported for the winemaker rather than silently fixed.
function fillPolicy(v,G){
  const red=v.color==='red',add=(G.addWindowHrs??48)/24;
  if(red){const soak=v.soak??0;return {red,toInoc:soak,addUntil:soak+add,prefMin:(G.redPrefMinFill??50)/100,warnMin:(G.redWarnMinFill??33)/100,soak}}
  const settle=(G.whiteSettleHrs??48)/24;return {red,toInoc:settle,addUntil:settle+add,prefMin:0,warnMin:0,settle,holdWarn:(G.whiteHoldWarnHrs??96)/24};
}
function fillFermentors(v,deliveries,capT,G){
  const P=fillPolicy(v,G),fills=[];let cur=null;
  for(const dv of deliveries){
    let rem=dv.tons;
    while(rem>1e-12){
      if(!cur||cur.tons>=capT-1e-9||dv.day>cur.first+P.addUntil+1e-9){cur={first:dv.day,inoc:dv.day+P.toInoc,addUntil:dv.day+P.addUntil,picks:[],tons:0,cap:capT};fills.push(cur)}
      const take=Math.min(rem,capT-cur.tons);
      cur.picks.push({day:dv.day,tons:take,delivery:dv,share:take/dv.tons,afterInoc:dv.day>cur.inoc+1e-9});
      cur.tons+=take;rem-=take;
    }
  }
  fills.forEach(F=>{F.last=F.picks[F.picks.length-1].day;F.fill=F.tons/capT;F.policy=P});
  return fills;
}
if(typeof module!=='undefined')module.exports={normCdf,sourcesOf,expectedArrival,deliveriesFor,binsOf,fillPolicy,fillFermentors};
