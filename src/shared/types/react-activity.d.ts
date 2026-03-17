import 'react';

declare module 'react' {
  interface ActivityProps {
    mode?: 'hidden' | 'visible';
    name?: string;
    children: ReactNode;
  }

  export const Activity: ExoticComponent<ActivityProps>;
}
