"use client";

import { useEffect, useRef } from "react";

export function AnimatedHalftone() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const resize = () => {
      // Use devicePixelRatio for sharp rendering on retina displays
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    window.addEventListener("resize", resize);
    resize();

    const draw = () => {
      time += 0.015;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Fill background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      
      const dotSpacing = 16;
      const maxRadius = 4;
      
      for (let x = 0; x < width + dotSpacing; x += dotSpacing) {
        for (let y = Math.max(0, height - 800); y < height + dotSpacing; y += dotSpacing) {
          // Move the wave center down towards the bottom edge
          const surfaceY = height - 50 + Math.sin(x / 150 - time * 1.5) * 80 + Math.cos(x / 300 + time) * 60;
          
          // Distance from the dot to the moving surface
          const distFromSurface = Math.abs(y - surfaceY);
          
          // Increase thickness to make it fill more space
          const ribbonThickness = 450;
          
          if (distFromSurface > ribbonThickness) continue;
          
          // Opacity fades out from the surface center
          let opacity = 1 - (distFromSurface / ribbonThickness);
          opacity = Math.pow(opacity, 1.2); // softer fade so more dots are visible
          
          ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.45})`;

          // Create a dynamic dot size wave effect
          const dx = x - width / 2;
          const dy = y - surfaceY;
          const wave1 = Math.sin(dx / 120 - time * 2);
          const wave2 = Math.cos(dy / 80 + time);
          
          const combinedWave = (wave1 + wave2) / 2;
          
          const normalized = (combinedWave + 1) / 2;
          const eased = Math.pow(normalized, 1.5);
          const radius = Math.max(0.5, eased * maxRadius);

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
    />
  );
}
