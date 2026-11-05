import blackLogo from "@/assets/renthub-logo.png";
import whiteLogo from "@/assets/renthub-logo-white.png";

type BrandLogoProps = {
  variant?: "black" | "white";
  className?: string;
};

export function BrandLogo({ variant = "black", className = "h-8 w-auto" }: BrandLogoProps) {
  return (
    <img
      src={variant === "white" ? whiteLogo : blackLogo}
      alt="Renthub.se"
      width={1427}
      height={240}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
