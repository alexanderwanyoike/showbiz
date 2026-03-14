interface ZoneContainerProps {
  area: string;
  className?: string;
  children: React.ReactNode;
}

export function ZoneContainer({ area, className, children }: ZoneContainerProps) {
  return (
    <div style={{ gridArea: area }} className={className}>
      {children}
    </div>
  );
}
