/** Pure two-finger camera math. The midpoint's world location stays under
 * the fingers while the midpoint translates or the pinch distance changes.
 */
export type Contact={x:number;y:number};
export type PinchOrigin={
  worldX:number;worldY:number;distance:number;zoom:number;
};
export function touchPair(a:Contact,b:Contact){
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(b.x-a.x,b.y-a.y)};
}
export function pinchCamera(
  origin:PinchOrigin,a:Contact,b:Contact,minZoom:number,maxZoom:number
){
  const pair=touchPair(a,b);
  const zoom=Math.max(minZoom,Math.min(maxZoom,
    origin.zoom*pair.distance/Math.max(1,origin.distance)));
  return {zoom,x:pair.x-origin.worldX*zoom,y:pair.y-origin.worldY*zoom};
}
