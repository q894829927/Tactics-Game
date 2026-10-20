import { MAP_HEIGHT, MAP_WIDTH } from "../engine/battle.ts";
import { TILE, WORLD_COLS, WORLD_ROWS, WORLD_WIDTH, WORLD_HEIGHT, TACTICAL_X, tileWorld } from "./worldGeometry.ts";
import { artNoise, riverBankX } from "./mapScenery.ts";
import { loadMapAsset, MAP_ASSET_FILES, type MapAssetFile } from "./mapAssets.ts";
import { groundSurfaceAt } from "./groundSurface.ts";

const LAND_FILES = [MAP_ASSET_FILES.ground, MAP_ASSET_FILES.groundVariant,
  MAP_ASSET_FILES.grass, MAP_ASSET_FILES.grassVariant] as const;

/** Only the reusable ground material is painted here. Trees/rocks stay separate sprites. */
export class GroundPainter {
  private textures = new Map<MapAssetFile, HTMLImageElement>();
  private failed = new Set<MapAssetFile>();
  private grassMask: HTMLCanvasElement;
  private grassLayer = document.createElement("canvas");
  private waterTexture: HTMLImageElement | null = null;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly mini: HTMLCanvasElement,
    private terrain: readonly string[]) {
    canvas.width = WORLD_WIDTH * 2; canvas.height = WORLD_HEIGHT * 2;
    mini.width = 512; mini.height = 384;
    this.grassLayer.width = canvas.width; this.grassLayer.height = canvas.height;
    this.grassMask = this.createGrassMask();
    this.paint();
    for (const file of LAND_FILES) {
      const texture = new Image();
      texture.decoding = "async";
      texture.addEventListener("load", async () => {
        await texture.decode().catch(() => {});
        this.textures.set(file,texture); this.paint();
      }, {once:true});
      texture.addEventListener("error", () => { this.failed.add(file); this.paint(); }, {once:true});
      void loadMapAsset(file).then(url => { texture.src = url; });
    }
    const water = new Image();
    water.decoding = "async";
    water.addEventListener("load", async () => {
      await water.decode().catch(() => {});
      this.waterTexture = water; this.paint();
    }, {once:true});
    // The base water fill remains available if the optional surface material fails.
    void loadMapAsset(MAP_ASSET_FILES.water).then(url => { water.src = url; });
  }

  setTerrain(terrain:readonly string[]):void{
    this.terrain=terrain;this.grassMask=this.createGrassMask();this.paint();
  }
  private paint(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(2,0,0,2,0,0);
    ctx.fillStyle = "#927551";
    ctx.fillRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
    const earth = this.available([MAP_ASSET_FILES.ground,MAP_ASSET_FILES.groundVariant]);
    if (earth.length) this.material(ctx,earth);
    else {
      // Immediate low-cost fallback, including when an asset cannot be loaded.
      for (let i=0; i<7500; i++) {
        ctx.fillStyle = i%3 === 0 ? "#c3a67c55" : "#5b473955";
        ctx.fillRect(artNoise(i)*WORLD_WIDTH,artNoise(i+9000)*WORLD_HEIGHT,2,1.5);
      }
    }
    this.grass(ctx);
    for (let y=0;y<MAP_HEIGHT;y++) for (let x=0;x<MAP_WIDTH;x++) {
      const type = this.terrain[y]?.[x];
      const p = tileWorld(x,y);
      if (type === "F" || type === "#") {
        const shadow=ctx.createRadialGradient(p.x,p.y,8,p.x,p.y,58);
        shadow.addColorStop(0,type === "F" ? "#102d25b0" : "#35423ca0");
        shadow.addColorStop(1,"#162e2500");
        ctx.fillStyle=shadow; ctx.fillRect(p.x-58,p.y-58,116,116);
      } else if (type === "H") {
        // A subtle underlay remains readable if the separate grassy knoll sprite fails.
        const hill=ctx.createRadialGradient(p.x-17,p.y-17,2,p.x,p.y,51);
        hill.addColorStop(0,"#a5a16a55");hill.addColorStop(.55,"#837a5155");hill.addColorStop(1,"#46523900");
        ctx.fillStyle=hill;ctx.fillRect(p.x-51,p.y-51,102,102);
      }
    }
    this.river(ctx);
    this.canvas.dataset.material = this.failed.size ? "fallback" :
      LAND_FILES.every(file=>this.textures.has(file)) ? "loaded" : "loading";
    const preview=this.mini.getContext("2d");
    if(preview) { preview.clearRect(0,0,512,384);preview.drawImage(this.canvas,0,0,512,384); }
  }

  private available(files: readonly MapAssetFile[]): HTMLImageElement[] {
    return files.flatMap(file=>this.textures.get(file) ? [this.textures.get(file)!] : []);
  }

  private material(ctx: CanvasRenderingContext2D, textures: readonly HTMLImageElement[]): void {
    // Feather overlapping material patches. No rotated directional light or hard 92px seams.
    const patch=document.createElement("canvas");patch.width=384;patch.height=384;
    const brush=patch.getContext("2d");if(!brush)return;
    for(let row=-1;row<5;row++) for(let col=-1;col<6;col++) {
      const seed=(row+2)*17+col+2;
      const texture=textures[Math.floor(artNoise(seed+280)*textures.length)]!;
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

  private createGrassMask(): HTMLCanvasElement {
    const hard=document.createElement("canvas"),soft=document.createElement("canvas");
    hard.width=soft.width=WORLD_WIDTH;hard.height=soft.height=WORLD_HEIGHT;
    const ctx=hard.getContext("2d")!;
    ctx.fillStyle="#fff";
    const grassy=(col:number,row:number)=>groundSurfaceAt(this.terrain,col,row)==="grass";
    for(let row=0;row<WORLD_ROWS;row++)for(let col=0;col<WORLD_COLS;col++) {
      if(!grassy(col,row))continue;
      const left=!grassy(col-1,row),right=!grassy(col+1,row),
        top=!grassy(col,row-1),bottom=!grassy(col,row+1);
      ctx.beginPath();ctx.roundRect(col*TILE,row*TILE,TILE,TILE,
        [left&&top?22:0,right&&top?22:0,right&&bottom?22:0,left&&bottom?22:0]);ctx.fill();
    }
    // Round earth peninsulas too, while leaving every tile center's material unchanged.
    for(let row=0;row<WORLD_ROWS;row++)for(let col=0;col<WORLD_COLS;col++) {
      if(grassy(col,row))continue;
      for(const [dx,dy] of [[-1,-1],[1,-1],[1,1],[-1,1]] as const) {
        if(!grassy(col+dx,row)||!grassy(col,row+dy))continue;
        const x=(col+(dx>0?1:0))*TILE,y=(row+(dy>0?1:0))*TILE;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-dx*22,y);
        ctx.quadraticCurveTo(x,y,x,y-dy*22);ctx.closePath();ctx.fill();
      }
    }
    // Only exposed boundaries are varied; neighboring grass cells remain one continuous patch.
    for(let row=0;row<WORLD_ROWS;row++)for(let col=0;col<WORLD_COLS;col++) {
      if(!grassy(col,row))continue;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        if(grassy(col+dx,row+dy))continue;
        const start=(dx===0?!grassy(col-1,row):!grassy(col,row-1))?24:4;
        const end=(dx===0?!grassy(col+1,row):!grassy(col,row+1))?TILE-24:TILE;
        for(let step=start;step<end;step+=8) {
          const seed=(row*WORLD_COLS+col)*43+step+dx*5+dy*13;
          const outward=artNoise(seed)>.5;
          const x=col*TILE+(dx===0?step:dx>0?TILE:0)+dx*(outward?2:-2);
          const y=row*TILE+(dy===0?step:dy>0?TILE:0)+dy*(outward?2:-2);
          ctx.globalCompositeOperation=outward?"source-over":"destination-out";
          ctx.beginPath();ctx.arc(x,y,2+artNoise(seed+160)*4,0,Math.PI*2);ctx.fill();
        }
      }
    }
    const blur=soft.getContext("2d")!;
    blur.filter="blur(4px)";blur.drawImage(hard,0,0);
    return soft;
  }

  private grass(ctx: CanvasRenderingContext2D): void {
    const layer=this.grassLayer.getContext("2d")!;
    layer.setTransform(2,0,0,2,0,0);layer.globalCompositeOperation="source-over";
    layer.clearRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
    layer.fillStyle="#56643b";layer.fillRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
    const grass=this.available([MAP_ASSET_FILES.grass,MAP_ASSET_FILES.grassVariant]);
    if(grass.length)this.material(layer,grass);
    layer.globalCompositeOperation="destination-in";
    layer.drawImage(this.grassMask,0,0,WORLD_WIDTH,WORLD_HEIGHT);
    layer.globalCompositeOperation="source-over";
    ctx.drawImage(this.grassLayer,0,0,WORLD_WIDTH,WORLD_HEIGHT);
  }

  private river(ctx: CanvasRenderingContext2D): void {
    const boundary=()=>{ctx.beginPath();ctx.moveTo(riverBankX(0),0);
      for(let y=0;y<=WORLD_HEIGHT;y+=4)ctx.lineTo(riverBankX(y),y);};
    boundary();ctx.lineTo(WORLD_WIDTH,WORLD_HEIGHT);ctx.lineTo(WORLD_WIDTH,0);ctx.closePath();
    const water=ctx.createLinearGradient(TACTICAL_X+MAP_WIDTH*TILE,0,WORLD_WIDTH,0);
    water.addColorStop(0,"#637e72");water.addColorStop(.38,"#456d68");water.addColorStop(1,"#254c50");
    ctx.fillStyle=water;ctx.fill();
    ctx.save();ctx.clip();
    if (this.waterTexture) this.material(ctx,[this.waterTexture]);
    const depth=ctx.createLinearGradient(TACTICAL_X+MAP_WIDTH*TILE,0,WORLD_WIDTH,0);
    depth.addColorStop(0,"#82967650");depth.addColorStop(.5,"#38534a15");depth.addColorStop(1,"#153b4640");
    ctx.fillStyle=depth;ctx.fillRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
    ctx.restore();
    // A narrow earth edge and scattered gravel replace the uniform striped embankment.
    boundary();ctx.strokeStyle="#293c3280";ctx.lineWidth=7;ctx.stroke();
    boundary();ctx.strokeStyle="#85836b58";ctx.lineWidth=2;ctx.stroke();
    for(let i=0;i<430;i++) {
      const y=artNoise(i+600)*WORLD_HEIGHT,x=riverBankX(y)-3-artNoise(i+750)*17;
      const size=1+artNoise(i+850)*2.5;
      ctx.fillStyle=i%3===0?"#c0b79a8a":"#4954478a";
      ctx.beginPath();ctx.ellipse(x,y,size,size*.65,artNoise(i)*Math.PI,0,Math.PI*2);ctx.fill();
    }
    this.canvas.dataset.waterMaterial = this.waterTexture ? "loaded" : "fallback";
  }
}
