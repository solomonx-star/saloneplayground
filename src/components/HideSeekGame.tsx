"use client";

import { useEffect, useRef, useState } from "react";
import type PhaserNamespace from "phaser";

type Notice = { text: string; kind: "ready" | "danger" | "success" };

export default function HideSeekGame({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Ready to count?", kind: "ready" });
  const [playing, setPlaying] = useState(false);
  const [found, setFound] = useState(0);
  const [input, setInput] = useState({ x: 0, y: 0 });
  useEffect(() => {
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;
    void import("phaser").then((module) => {
      if (disposed || !hostRef.current) return;
      const Phaser = module.default;
      class SeekField extends Phaser.Scene {
        private seeker!: PhaserNamespace.GameObjects.Arc;
        private hiders: Array<{ token: PhaserNamespace.GameObjects.Arc; label: PhaserNamespace.GameObjects.Text; x: number; y: number; found: boolean }> = [];
        private keys!: Record<string, PhaserNamespace.Input.Keyboard.Key>;
        private playing = false;
        private counting = 0;
        private foundCount = 0;
        private notice!: PhaserNamespace.GameObjects.Text;
        private hints!: PhaserNamespace.GameObjects.Text;
        constructor() { super("SeekField"); }
        create() {
          const g = this.add.graphics();
          g.fillGradientStyle(0x85a86a, 0x85a86a, 0x627f52, 0x627f52, 1).fillRect(0, 0, 960, 600);
          g.fillStyle(0x70945c, 0.9).fillEllipse(475, 300, 700, 430);
          g.lineStyle(3, 0xd5dfad, 0.8).strokeRoundedRect(40, 40, 880, 520, 22);
          // Home base and safe, bounded hiding spots.
          g.fillStyle(0xead78c, 0.9).fillCircle(480, 300, 43).lineStyle(3, 0x805f37, 0.9).strokeCircle(480, 300, 43);
          this.add.text(458, 294, "HOME", { fontFamily: "Arial", fontSize: "13px", color: "#513d28", fontStyle: "bold" });
          const spots = [{x:150,y:150},{x:310,y:120},{x:640,y:128},{x:810,y:165},{x:130,y:420},{x:330,y:470},{x:650,y:465},{x:825,y:420}];
          spots.forEach((p, i) => {
            if (i % 3 === 0) { g.fillStyle(0x385a38).fillCircle(p.x,p.y,34).fillStyle(0x4d7047).fillCircle(p.x-4,p.y-8,25); }
            else if (i % 3 === 1) { g.fillStyle(0x76583c).fillRoundedRect(p.x-28,p.y-23,56,46,8).fillStyle(0x96734b).fillRect(p.x-21,p.y-16,42,12); }
            else { g.fillStyle(0x3d683e).fillEllipse(p.x,p.y,85,52); }
          });
          this.add.text(55, 48, "PLAY KECH · STAY INSIDE THE YARD", { fontFamily: "Arial", fontSize: "12px", color: "#f2f1d9", fontStyle: "bold" });
          this.seeker = this.add.circle(480, 300, 16, 0xe57859).setStrokeStyle(3, 0xffd2c4).setDepth(4);
          this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE") as typeof this.keys;
          this.notice = this.add.text(480, 330, "", { fontFamily: "Arial", fontSize: "22px", color: "#fff4c6", fontStyle: "bold", align: "center", stroke: "#25402e", strokeThickness: 4 }).setOrigin(.5).setDepth(7);
          this.hints = this.add.text(480, 360, "", { fontFamily: "Arial", fontSize: "12px", color: "#f7f4dd", align: "center", stroke: "#25402e", strokeThickness: 3 }).setOrigin(.5).setDepth(7);
          this.input.on("pointerdown", (pointer: PhaserNamespace.Input.Pointer) => this.tryFind(pointer.worldX, pointer.worldY));
          window.addEventListener("seek-start", this.start);
          window.addEventListener("seek-move", this.move);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { window.removeEventListener("seek-start", this.start); window.removeEventListener("seek-move", this.move); });
          this.makeHiders();
          this.notice.setText("READY?"); this.hints.setText("Count at home while everyone hides.");
        }
        private start = () => {
          this.makeHiders(); this.seeker.setPosition(480,300); this.foundCount=0; setFound(0); this.counting=5; this.playing=true;
          this.notice.setText("COUNT: 5"); this.hints.setText("Close your eyes and count!"); setNotice({text:"Count to five while the others hide.",kind:"ready"}); setPlaying(true);
        };
        private move = (event: Event) => { (window as Window & { seekInput?: {x:number;y:number} }).seekInput = (event as CustomEvent<{x:number;y:number}>).detail; };
        private makeHiders() {
          this.hiders.forEach((h) => { h.token.destroy(); h.label.destroy(); }); this.hiders=[];
          const places=[{x:145,y:150},{x:315,y:120},{x:650,y:128},{x:815,y:168},{x:132,y:420},{x:330,y:470},{x:650,y:465},{x:825,y:420}];
          Phaser.Utils.Array.Shuffle(places);
          places.slice(0,5).forEach((p,i)=>{
            const token=this.add.circle(p.x,p.y,12,[0x69c6ef,0xf5cb67,0xd1a0dd,0x92d18b,0xf29b68][i]).setStrokeStyle(2,0xffffff).setAlpha(.05).setDepth(3);
            const label=this.add.text(p.x-4,p.y-5,String(i+1),{fontFamily:"Arial",fontSize:"10px",color:"#fff",fontStyle:"bold"}).setAlpha(0).setDepth(4);
            this.hiders.push({token,label,x:p.x,y:p.y,found:false});
          });
        }
        private tryFind(x:number,y:number) {
          if (!this.playing || this.counting>0) return;
          const near=this.hiders.find((h)=>!h.found&&Phaser.Math.Distance.Between(this.seeker.x,this.seeker.y,h.x,h.y)<58&&Phaser.Math.Distance.Between(x,y,h.x,h.y)<64);
          if (near) this.find(near);
        }
        private find(h:{token:PhaserNamespace.GameObjects.Arc;label:PhaserNamespace.GameObjects.Text;x:number;y:number;found:boolean}) {
          h.found=true; h.token.setAlpha(1).setScale(1.35); h.label.setAlpha(1); this.foundCount++; setFound(this.foundCount);
          if(this.foundCount===this.hiders.length){this.playing=false;this.notice.setText("ALL FOUND!");this.hints.setText("Everyone was found. Start another round.");setNotice({text:"You found everyone hiding in the yard!",kind:"success"});setPlaying(false);}
          else {this.notice.setText("FOUND!");this.hints.setText(`${this.foundCount} of ${this.hiders.length} found`);setNotice({text:`You found a hider. ${this.hiders.length-this.foundCount} remain.`,kind:"success"});}
        }
        update(_time:number,delta:number) {
          if(!this.playing)return;
          if(this.counting>0){this.counting-=delta/1000;this.notice.setText(`COUNT: ${Math.max(1,Math.ceil(this.counting))}`);if(this.counting<=0){this.counting=0;this.notice.setText("HERE I COME!");this.hints.setText("Search the hiding spots. Get close and tap to find.");setNotice({text:"Here you come! Move around and tap near a hiding spot.",kind:"ready"});}return;}
          const input=(window as Window & {seekInput?:{x:number;y:number}}).seekInput??{x:0,y:0};let dx=input.x,dy=input.y;
          if(this.keys.LEFT.isDown||this.keys.A.isDown)dx-=1;if(this.keys.RIGHT.isDown||this.keys.D.isDown)dx+=1;if(this.keys.UP.isDown||this.keys.W.isDown)dy-=1;if(this.keys.DOWN.isDown||this.keys.S.isDown)dy+=1;
          const len=Math.hypot(dx,dy);if(len)this.seeker.setPosition(Phaser.Math.Clamp(this.seeker.x+dx/len*190*Math.min(delta/1000,.04),58,902),Phaser.Math.Clamp(this.seeker.y+dy/len*190*Math.min(delta/1000,.04),58,542));
          this.hiders.filter(h=>!h.found).forEach(h=>{const d=Phaser.Math.Distance.Between(this.seeker.x,this.seeker.y,h.x,h.y);h.token.setAlpha(d<100?.28:.045);h.label.setAlpha(d<62?.8:0);if(this.keys.SPACE.isDown&&d<58)this.find(h);});
        }
      }
      game=new Phaser.Game({type:Phaser.AUTO,parent:hostRef.current,width:960,height:600,backgroundColor:"#627f52",scene:SeekField,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true}});
    });
    return ()=>{disposed=true;game?.destroy(true);};
  },[]);
  function start(){window.dispatchEvent(new Event("seek-start"));}
  function move(x:number,y:number){(window as Window & {seekInput?:{x:number;y:number}}).seekInput={x,y};window.dispatchEvent(new CustomEvent("seek-move",{detail:{x,y}}));setInput({x,y});}
  return <main className="game-screen seek-screen"><header className="game-topbar"><button className="back-button" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);onBack();}}>← <span>GAMES</span></button><div className="game-title"><span className="brand-mark">S</span><strong>PLAY KECH</strong><small>HIDE AND SEEK</small></div><span className="game-role">FOUND {found} / 5</span></header><div className="game-stage"><div className="game-frame"><div className="game-host" ref={hostRef}/><div className={`notice ${notice.kind}`} role="status"><span>{notice.kind==="success"?"✓":"↗"}</span>{notice.text}</div>{!playing&&<button className="start-overlay" onClick={start}><span>▶</span>{notice.kind==="success"?"PLAY AGAIN":"START GAME"}</button>}</div></div><div className="game-bottom"><span className="game-help">WASD / arrow keys to search. Get close to a hiding spot, then tap it or press Space.</span><div className="mobile-controls" aria-label="Movement controls"><button onPointerDown={()=>move(-1,0)} onPointerUp={()=>move(0,0)} onPointerLeave={()=>move(0,0)} aria-label="Move left">←</button><div><button onPointerDown={()=>move(0,-1)} onPointerUp={()=>move(0,0)} onPointerLeave={()=>move(0,0)} aria-label="Move up">↑</button><button onPointerDown={()=>move(0,1)} onPointerUp={()=>move(0,0)} onPointerLeave={()=>move(0,0)} aria-label="Move down">↓</button></div><button onPointerDown={()=>move(1,0)} onPointerUp={()=>move(0,0)} onPointerLeave={()=>move(0,0)} aria-label="Move right">→</button></div><span className="game-help">Keep the seeker inside the marked yard.</span></div></main>;
}
