import { MAP_HEIGHT, MAP_WIDTH } from "../engine/battle.ts";
import { TILE, WORLD_WIDTH, WORLD_HEIGHT, TACTICAL_X, TACTICAL_Y, tileWorld } from "./worldGeometry.ts";
import { artNoise, riverBankX } from "./mapScenery.ts";
import { loadMapAsset, MAP_ASSET_FILES } from "./mapAssets.ts";

/** Only the reusable ground material is painted here. Trees/rocks stay separate sprites. */
export class GroundPainter {
  private texture: HTMLImageElement | null = null;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly mini: HTMLCanvasElement,
    private readonly terrain: readonly string[]) {
    canvas.width = WORLD_WIDTH * 2; canvas.height = WORLD_HEIGHT * 2;
    mini.width = 512; mini.height = 384;
    this.paint();
    const texture = new Image();
    texture.decoding = "async";
    texture.addEventListener("load", async () => {
      await texture.decode().catch(() => {});
      this.texture = texture; this.paint();
    }, {once:true});
    texture.addEventListener("error", () => { canvas.dataset.material = "fallback"; }, {once:true});
    void loadMapAsset(MAP_ASSET_FILES.ground).then(url => { texture.src = url; });
  }

  private paint(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(2,0,0,2,0,0);
    ctx.fillStyle = "#63704d";
    ctx.fillRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
    if (this.texture) this.material(ctx, this.texture);
    else {
      // Immediate low-cost fallback, including when an asset cannot be loaded.
      for (let i=0; i<7500; i++) {
        ctx.fillStyle = i%3 === 0 ? "#82905b55" : "#334e3655";
        ctx.fillRect(artNoise(i)*WORLD_WIDTH,artNoise(i+9000)*WORLD_HEIGHT,2,1.5);
      }
    }
    this.path(ctx);
    for (let y=0;y<MAP_HEIGHT;y++) for (let x=0;x<MAP_WIDTH;x++) {
      const type = this.terrain[y]?.[x];
      const p = tileWorld(x,y);
      if (type === "F" || type === "#") {
        const shadow=ctx.createRadialGradient(p.x,p.y,8,p.x,p.y,58);
        shadow.addColorStop(0,type === "F" ? "#102d25b0" : "#35423ca0");
        shadow.addColorStop(1,"#162e2500");
        ctx.fillStyle=shadow; ctx.fillRect(p.x-58,p.y-58,116,116);
      } else if (type === "H") {
        // A shallow, walkable grassy slope, distinct from the blocked rock faces.
        const hill=ctx.createRadialGradient(p.x-17,p.y-17,2,p.x,p.y,51);
        hill.addColorStop(0,"#a5a16a55");hill.addColorStop(.55,"#837a5155");hill.addColorStop(1,"#46523900");
        ctx.fillStyle=hill;ctx.fillRect(p.x-51,p.y-51,102,102);
        ctx.strokeStyle="#c7ba8548";ctx.lineWidth=1.5;
        for(let i=0;i<3;i++) {
          ctx.beginPath();ctx.ellipse(p.x,p.y+8+i*8,30-i*4,12,0,Math.PI*.1,Math.PI*.9);ctx.stroke();
        }
      }
    }
    this.river(ctx);
    this.canvas.dataset.material = this.texture ? "loaded" : "fallback";
    const preview=this.mini.getContext("2d");
    if(preview) { preview.clearRect(0,0,512,384);preview.drawImage(this.canvas,0,0,512,384); }
  }

  private material(ctx: CanvasRenderingContext2D, texture: HTMLImageElement): void {
    // Feather overlapping material patches. No rotated directional light or hard 92px seams.
    const patch=document.createElement("canvas");patch.width=384;patch.height=384;
    const brush=patch.getContext("2d");if(!brush)return;
    for(let row=-1;row<5;row++) for(let col=-1;col<6;col++) {
      const seed=(row+2)*17+col+2;
      brush.clearRect(0,0,384,384);brush.globalCompositeOperation="source-over";
      const crop=Math.min(texture.naturalWidth,texture.naturalHeight)*.8;
      const sx=artNoise(seed)*Math.max(0,texture.naturalWidth-crop);
      const sy=artNoise(seed+170)*Math.max(0,texture.naturalHeight-crop);
      brush.drawImage(texture,sx,sy,crop,crop,0,0,384,384);
      brush.globalCompositeOperation="destination-in";
      for(const horizontal of [true,false]) {
        const fade=brush.createLinearGradient(0,0,horizontal?384:0,horizontal?0:384);
        fade.addColorStop(0,"#fff0");fade.addColorStop(.12,"#ffff");
        fade.addColorStop(.88,"#ffff");fade.addColorStop(1,"#fff0");
        brush.fillStyle=fade;brush.fillRect(0,0,384,384);
      }
      ctx.drawImage(patch,col*288+artNoise(seed+35)*12,row*288+artNoise(seed+65)*12);
    }
  }

  private path(ctx: CanvasRenderingContext2D): void {
    const start=tileWorld(0,7),end=tileWorld(9,6);
    const route=()=>{ctx.beginPath();ctx.moveTo(132,WORLD_HEIGHT);ctx.bezierCurveTo(170,1010,280,925,start.x,start.y);
      ctx.bezierCurveTo(470,850,610,775,760,785);ctx.bezierCurveTo(920,798,1030,770,end.x,end.y);};
    ctx.lineCap="round";ctx.lineJoin="round";
    route();ctx.strokeStyle="#d6c39522";ctx.lineWidth=78;ctx.stroke();
    route();ctx.strokeStyle="#6e604198";ctx.lineWidth=50;ctx.stroke();
    route();ctx.strokeStyle="#a99a714b";ctx.lineWidth=28;ctx.stroke();
    // Small stones/soil variation break up the smooth brush strokes along the road.
    const cubic=(a:number,b:number,c:number,d:number,t:number)=>
      (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
    for(let i=0;i<850;i++) {
      const first=i<500,t=first?i/500:(i-500)/350;
      const x=first?cubic(start.x,470,610,760,t):cubic(760,920,1030,end.x,t);
      const y=first?cubic(start.y,850,775,785,t):cubic(785,798,770,end.y,t);
      ctx.fillStyle=i%3===0?"#d1bc875c":"#3a392948";
      ctx.fillRect(x+(artNoise(i+380)*2-1)*12,y+(artNoise(i+420)*2-1)*22,1.5+artNoise(i)*2,1.5);
    }
  }

  private river(ctx: CanvasRenderingContext2D): void {
    const boundary=()=>{ctx.beginPath();ctx.moveTo(riverBankX(0),0);
      for(let y=0;y<=WORLD_HEIGHT;y+=8)ctx.lineTo(riverBankX(y),y);};
    boundary();ctx.lineTo(WORLD_WIDTH,WORLD_HEIGHT);ctx.lineTo(WORLD_WIDTH,0);ctx.closePath();
    const water=ctx.createLinearGradient(TACTICAL_X+MAP_WIDTH*TILE,0,WORLD_WIDTH,0);
    water.addColorStop(0,"#5d9690");water.addColorStop(.38,"#2a747d");water.addColorStop(1,"#123f50");
    ctx.fillStyle=water;ctx.fill();
    boundary();ctx.strokeStyle="#40543bc0";ctx.lineWidth=25;ctx.stroke();
    boundary();ctx.strokeStyle="#8e958074";ctx.lineWidth=12;ctx.stroke();
    boundary();ctx.strokeStyle="#c2d6c351";ctx.lineWidth=3;ctx.stroke();
    ctx.lineWidth=1.5;
    for(let i=0;i<72;i++) {
      const y=artNoise(i+600)*WORLD_HEIGHT,x=riverBankX(y)+24+artNoise(i+750)*110;
      ctx.strokeStyle=i%3===0?"#a3d2cb55":"#438f9945";
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-6,y+16,x+5,y+32);ctx.stroke();
    }
  }
}
