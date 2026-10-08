
function build(a){                       // a[0]=1 最高次在前
  var n=a.length-1, rows=[];
  var r0=[],r1=[];
  for(var i=0;i<=n;i+=2) r0.push(a[i]||0);
  for(var i=1;i<=n;i+=2) r1.push(a[i]||0);
  rows.push(r0); rows.push(r1);
  while(rows.length<=n){
    var A=rows[rows.length-2], B=rows[rows.length-1];
    var L=Math.max(A.length,B.length), nr=[];
    for(var k=1;k<L;k++){
      var a0=A[0], b0=B[0];
      nr.push(b0===0?0:(b0*(A[k]||0)-a0*(B[k]||0))/b0);
    }
    rows.push(nr);
  }
  return rows;
}
function cmul(x,y){return [x[0]*y[0]-x[1]*y[1], x[0]*y[1]+x[1]*y[0]];}
function csub(x,y){return [x[0]-y[0],x[1]-y[1]];}
function cdiv(x,y){var d=y[0]*y[0]+y[1]*y[1];return [(x[0]*y[0]+x[1]*y[1])/d,(x[1]*y[0]-x[0]*y[1])/d];}
function cabs(x){return Math.hypot(x[0],x[1]);}
function peval(a,z){var r=[0,0];for(var i=0;i<a.length;i++)r=cmul(r,z),r=[r[0]+a[i],r[1]];return r;}
function roots(a){
  var n=a.length-1, r=[], k;
  for(k=0;k<n;k++){var t=0.4+0.9*k;r.push([Math.cos(t),Math.sin(t)]);}
  for(var it=0;it<900;it++){
    for(k=0;k<n;k++){
      var num=peval(a,r[k]), den=[1,0];
      for(var j=0;j<n;j++) if(j!==k) den=cmul(den,csub(r[k],r[j]));
      r[k]=csub(r[k],cdiv(num,den));
    }
  }
  return r;
}
function symOrigin(rs){ return rs.every(function(x){ return rs.some(function(y){ return cabs([x[0]+y[0],x[1]+y[1]])<1e-6; }); }); }
function symIm(rs){ return rs.every(function(x){ return rs.some(function(y){ return Math.abs(x[0]+y[0])<1e-6 && Math.abs(x[1]-y[1])<1e-6; }); }); }
function show(a){
  var rows=build(a);
  var firstZero=-1, allZero=-1;
  rows.forEach(function(r,i){
    var nz=r.filter(function(v){return Math.abs(v)>1e-9;}).length;
    if(nz===0) allZero=i; else if(Math.abs(r[0])<1e-9) firstZero=i;
  });
  var rs=roots(a);
  var tag = allZero>=0 ? '整行全0 @行'+allZero : (firstZero>=0 ? '第一列有0 @行'+firstZero : '正常');
  console.log('  a = [' + a.join(',') + ']');
  console.log('    ' + tag + ' | 关于原点对称? ' + symOrigin(rs) + ' | 关于jω轴对称? ' + symIm(rs));
  console.log('    根 = ' + rs.map(function(z){return z[0].toFixed(3)+(z[1]>=0?'+':'')+z[1].toFixed(3)+'j';}).join(', '));
}
console.log('=== 先用书上例 3.32 验我这张表算得对不对 ===');
var ex=[1,4,3,2,1,4,4];
build(ex).forEach(function(r,i){ console.log('  row'+i+': ' + r.map(function(v){return Math.abs(v)<1e-9?'0':v.toFixed(4);}).join('  ')); });
console.log('  书上: s6:1 3 1 4 | s5:4 2 4 0 | s4:2.5 0 4 | s3:2 -2.4 0 | s2:3 4 | s1:-5.0667 0 | s0:4');
console.log('');
console.log('=== 特例 ===');
show([1,1,4,4]);            // (s+1)(s^2+4)
show([1,2,1,2]);            // (s+2)(s^2+1)
show([1,3,3,2]);            // (s+1)(s+2)(s^2+1)? = s4+3s3+3s2+3s+2
show([1,3,3,3,2]);
