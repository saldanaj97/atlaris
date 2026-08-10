export function SectionOverline({ children }: { children: string }) {
  return (
    <p className='font-serif text-[0.6875rem] font-medium tracking-[0.22em] text-primary uppercase sm:text-xs'>
      {children}
    </p>
  );
}
