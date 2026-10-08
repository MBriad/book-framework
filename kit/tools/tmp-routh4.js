
function build(a,eps){ var n=a.length-1, rows=[], r0=[],r1=[];
  for(var i=0;i<=n;i+=2) r0.push(a[i]||0);
  for(var i=1;i<=n;i+=2) r1.push(a[i]||0);
  rows.push(r0); rows.push(r1);
  while(rows.length<=n){ var A=rows[rows.length-2], B=rows[rows.length-1].slice();
    if(eps!==undefined && Math.abs(B[0])<1e-14) B[0]=eps;
    var L=Math.max(A.length,B.length), nr=[];
    for(var k=1;k<L;k++){ var a0=A[0], b0=B[0];
      nr.push(b0===0?0:(b0*(A[k]||0)-a0*(B[k]||0))/b0); }
    rows.push(nr); }
  return rows;
}
function cmul(x,y){return [x[0]*y[0]-x[1]*y[1],x[0]*y[1]+x[1]*y[0]];}
function csub(x,y){return [x[0]-y[0],x[1]-y[1]];}
function cdiv(x,y){var d=y[0]*y[0]+y[1]*y[1]||1e-300;return [(x[0]*y[0]+x[1]*y[1])/d,(x[1]*y[0]-x[0]*y[1])/d];}
function cabs(x){return Math.hypot(x[0],x[1]);}
function peval(a,z){var r=[0,0];for(var i=0;i<a.length;i++){r=cmul(r,z);r=[r[0]+a[i],r[1]];}return r;}
function roots(c){ var a=c.map(function(v){return v/c[0];}), n=c.length-1, bound=1;
  for(var i=1;i<a.length;i++) bound=Math.max(bound,Math.abs(a[i]));
  var rs=[]; for(i=0;i<n;i++){var ang=2*Math.PI*i/n+0.5; rs.push([Math.cos(ang)*bound,Math.sin(ang)*bound]);}
  for(var it=0;it<600;it++) for(i=0;i<n;i++){ var num=peval(a,rs[i]),den=[1,0];
    for(var j=0;j<n;j++) if(j!==i) den=cmul(den,csub(rs[i],rs[j]));
    if(cabs(den)<1e-14) den=[1e-14,1e-14];
    rs[i]=csub(rs[i],cdiv(num,den)); }
  return rs; }
function nrhp(a){ return roots(a).filter(function(z){return z[0]>1e-7;}).length; }
function changes(col){ var s=0,p=0; col.forEach(function(v){ if(Math.abs(v)<1e-12)return; var q=v>0?1:-1; if(p&&q!==p)s++; p=q; }); return s; }

var stat={n:0, naiveLt:0, epsOK:0, dist:{}};
for(var deg=5;deg<=6;deg++){
  var idx=new Array(deg).fill(1), lim=5;
  function rec(k){ if(k>deg) return; for(var v=1;v<=lim;v++){ idx[k]=v; if(k===deg) check([1].concat(idx)); else rec(k+1); } }
  rec(0);
}
function check(a){
  var rows=build(a), hit=-1;
  for(var i=2;i<rows.length;i++){ var r=rows[i];
    if(Math.abs(r[0])<1e-12 && r.filter(function(v){return Math.abs(v)>1e-9;}).length>0){ hit=i; break; } }
  if(hit<0) return;
  var naive=changes(rows.map(function(r){return r[0];}));
  var eps=changes(build(a,1e-9).map(function(r){return r[0];}));
  var tr=nrhp(a);
  stat.n++; if(naive<tr) stat.naiveLt++; if(eps===tr) stat.epsOK++;
  stat.dist[tr]=(stat.dist[tr]||0)+1;
}
console.log('=== 第一列有 0（该行还有非零元）的样例统计 ===');
console.log('  样例数 = ' + stat.n);
console.log('  跳过0的朴素数法 < 真实值 的次数 = ' + stat.naiveLt + ' / ' + stat.n);
console.log('  ε 法 == 真实值 的次数 = ' + stat.epsOK + ' / ' + stat.n);
console.log('  真实 RHP 根数分布 = ' + JSON.stringify(stat.dist));

console.log('');
console.log('=== 页面要用的两个例子 ===');
function dump(a,label){
  console.log('--- ' + label + ' : a = [' + a.join(', ') + ']');
  build(a).forEach(function(r,i){ console.log('    row'+i+' (s^'+(a.length-1-i)+'): [' + r.map(function(v){return Math.abs(v)<1e-12?'0':v.toFixed(4);}).join(', ') + ']'); });
  console.log('    真实根 = ' + roots(a).map(function(z){return z[0].toFixed(4)+(z[1]>=0?'+':'')+z[1].toFixed(4)+'j';}).join(', '));
  console.log('    真实 RHP 根数 = ' + nrhp(a));
}
dump([1,1,1,1,2,1],'例①  s^5+s^4+s^3+s^2+2s+1');
console.log('    ε 法第一列(ε=1e-9) = [' + build([1,1,1,1,2,1],1e-9).map(function(r){return r[0];}).map(function(v){return Math.abs(v)<1e-12?'0':v.toExponential(2);}).join(', ') + ']');
console.log('    → 符号变化 = ' + changes(build([1,1,1,1,2,1],1e-9).map(function(r){return r[0];})));
console.log('    跳过0数法 = ' + changes(build([1,1,1,1,2,1]).map(function(r){return r[0];})));
console.log('');
dump([1,1,4,4],'例②  s^3+s^2+4s+4 = (s+1)(s^2+4)');
console.log('    辅助多项式 A(s) = s^2+4，根 = ±2j（关于原点对称）');
