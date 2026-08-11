import type { ImgHTMLAttributes } from "react";

const logoSources = {
  "light-background": new URL("../../public/logo-light-bg.svg", import.meta.url).href,
  "dark-background": new URL("../../public/logo-dark-bg.svg", import.meta.url).href,
  icon: new URL("../../public/icon-transparent.svg", import.meta.url).href,
} as const;

export type BrandLogoVariant = keyof typeof logoSources;

export type BrandLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src"> & {
  variant: BrandLogoVariant;
  label?: string;
};

export function BrandLogo({ variant, label, ...props }: BrandLogoProps) {
  return (
    <img
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      src={logoSources[variant]}
      {...props}
    />
  );
}
