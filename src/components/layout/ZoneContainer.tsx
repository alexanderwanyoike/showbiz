interface ZoneContainerProps {
  area: string;
  className?: string;
  children: React.ReactNode;
}

export function ZoneContainer({ area, className, children }: ZoneContainerProps) {
  return (
    <div style={{ gridArea: area }} className={`min-h-0 min-w-0 overflow-hidden ${className ?? ""}`}>
      {children}
    </div>
  );
}
