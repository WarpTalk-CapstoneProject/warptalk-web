"use client";

import { useMemo, useState, type CSSProperties } from "react";
import styles from "./glass-material.module.css";

const materialLayers = [
  "Soft outer rim",
  "Frosted bevel haze",
  "Deep inset transition",
  "Subtle surface streaks",
  "Corner bloom",
  "Recessed content layer",
];

export default function GlassMaterialLabPage() {
  const [thickness, setThickness] = useState(0.5);
  const [light, setLight] = useState(1);
  const [frost, setFrost] = useState(0.9);

  const cardStyle = useMemo(
    () =>
      ({
        "--glass-thickness": thickness.toFixed(2),
        "--glass-light": light.toFixed(2),
        "--glass-frost": frost.toFixed(2),
      }) as CSSProperties,
    [thickness, light, frost]
  );

  return (
    <main className={styles.stage}>
      <div className={styles.backgroundGrid} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbLarge}`} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbTop}`} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbRight}`} aria-hidden="true" />
      <div className={styles.lightBloom} aria-hidden="true" />

      <section className={styles.workbench} aria-label="Glass material CSS test">
        <div className={styles.scene}>
          <article className={styles.glassCard} style={cardStyle}>
            <span className={styles.outerRim} aria-hidden="true" />
            <span className={styles.bevelWall} aria-hidden="true" />
            <span className={styles.innerRim} aria-hidden="true" />
            <span className={styles.surfaceReflection} aria-hidden="true" />
            <span className={styles.topEdgeLight} aria-hidden="true" />
            <span className={styles.leftEdgeWarmth} aria-hidden="true" />
            <span className={styles.rightEdgeLight} aria-hidden="true" />
            <span className={styles.cornerGlint} aria-hidden="true" />
            <span className={styles.lowerCaustic} aria-hidden="true" />

            <div className={styles.cardContent}>
              <p className={styles.eyebrow}>WarpTalk Material Lab</p>
              <h1>Physical glass panel</h1>
              <p className={styles.copy}>
                Layered CSS treatment for a thick, bevelled glass card with rim light,
                inset shadow, specular streaks, and corner reflection.
              </p>

              <div className={styles.badgeRow}>
                <span>CSS mask</span>
                <span>Backdrop</span>
                <span>Inset light</span>
              </div>
            </div>

            <div className={styles.dotStack} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </article>

          <aside className={styles.layerPanel}>
            <div className={styles.layerHeader}>
              <span>Layer stack</span>
              <strong>06</strong>
            </div>
            <ul>
              {materialLayers.map((layer) => (
                <li key={layer}>{layer}</li>
              ))}
            </ul>
          </aside>
        </div>

        <div className={styles.controlBar}>
          <label>
            <span>Thickness</span>
            <input
              type="range"
              min="0.5"
              max="1.7"
              step="0.05"
              value={thickness}
              onChange={(event) => setThickness(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Rim light</span>
            <input
              type="range"
              min="0.35"
              max="1"
              step="0.01"
              value={light}
              onChange={(event) => setLight(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Frost</span>
            <input
              type="range"
              min="0.15"
              max="0.9"
              step="0.01"
              value={frost}
              onChange={(event) => setFrost(Number(event.target.value))}
            />
          </label>
        </div>
      </section>
    </main>
  );
}
