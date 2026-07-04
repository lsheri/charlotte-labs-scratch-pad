import logo from "@/assets/charlotte-logo.png";
import { cn } from "@/lib/utils";

export function CharlotteLogo({ className, alt = "Charlotte Labs" }: { className?: string; alt?: string }) {
  return <img src={logo} alt={alt} className={cn("object-contain", className)} />;
}
