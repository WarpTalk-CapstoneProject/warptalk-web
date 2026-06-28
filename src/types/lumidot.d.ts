declare module 'lumidot' {
  import { FC } from 'react';
  
  export interface LumidotProps {
    variant?: 'black' | 'white' | 'gray';
    pattern?: 'dots' | 'grid' | 'frame';
    glow?: number;
    className?: string;
  }
  
  export const Lumidot: FC<LumidotProps>;
}
