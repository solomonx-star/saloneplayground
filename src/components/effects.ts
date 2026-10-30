import type PhaserNamespace from "phaser";

// Short visual effects shared by the game scenes. Each one cleans up its own objects when its tween ends.

export function ripple(scene: PhaserNamespace.Scene, x: number, y: number, color: number, size = 4.5) {
  for (const delay of [0, 120]) {
    const ring = scene.add.circle(x, y, 10).setStrokeStyle(3, color).setDepth(8);
    scene.tweens.add({ targets: ring, scale: size, alpha: 0, duration: 600, delay, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
  }
}

export function burst(scene: PhaserNamespace.Scene, x: number, y: number) {
  const colors = [0xd7ec83, 0xf7e486, 0x69c6ef, 0xffffff];
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const dot = scene.add.circle(x, y, 4, colors[i % colors.length]).setDepth(8);
    scene.tweens.add({ targets: dot, x: x + Math.cos(angle) * 60, y: y + Math.sin(angle) * 60, alpha: 0, scale: 0.4, duration: 700, ease: "Cubic.easeOut", onComplete: () => dot.destroy() });
  }
}

export function floatText(scene: PhaserNamespace.Scene, text: string, x: number, y: number, color: string) {
  const label = scene.add.text(x, y, text, { fontFamily: "Arial", fontSize: "14px", color, fontStyle: "bold", stroke: "#0d2f24", strokeThickness: 3 }).setOrigin(0.5).setDepth(9);
  scene.tweens.add({ targets: label, y: y - 34, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => label.destroy() });
}
