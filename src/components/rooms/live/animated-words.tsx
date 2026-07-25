"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { getAnimatedWordTokens } from "@/lib/transcript-display";

type AnimatedWordsProps = {
  text: string;
  maxCharacters?: number;
};

export function AnimatedWords({ text, maxCharacters }: AnimatedWordsProps) {
  const prefersReducedMotion = useReducedMotion();
  const previousKeysRef = useRef<Set<string>>(new Set());
  const tokens = useMemo(() => getAnimatedWordTokens(text, maxCharacters), [maxCharacters, text]);

  let newWordOrder = 0;
  const words = tokens.map((token) => {
    const isNew = !previousKeysRef.current.has(token.key);
    const revealOrder = isNew ? newWordOrder++ : 0;
    const shouldAnimate = isNew && !prefersReducedMotion;

    return (
      <motion.span
        key={token.key}
        aria-hidden="true"
        className="inline-block"
        initial={shouldAnimate ? { opacity: 0, y: 4, filter: "blur(2px)" } : false}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{
          duration: shouldAnimate ? 0.18 : 0,
          delay: shouldAnimate ? Math.min(revealOrder * 0.028, 0.18) : 0,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {token.word}
      </motion.span>
    );
  });

  useEffect(() => {
    previousKeysRef.current = new Set(tokens.map((token) => token.key));
  }, [tokens]);

  return (
    <span aria-label={text}>
      {words.map((word, index) => (
        <span key={tokens[index].key}>
          {index > 0 ? " " : null}
          {word}
        </span>
      ))}
    </span>
  );
}
