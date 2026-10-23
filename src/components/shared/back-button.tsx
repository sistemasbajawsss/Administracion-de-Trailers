"use client";

import { ChevronLeft } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";

import { useGoBack } from "./go-back";

/**
 * Flecha "Volver": regresa a la pantalla de donde se llegó. Si la página se
 * abrió directo, va a `fallback` (la lista a la que pertenece).
 */
export function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const goBack = useGoBack();

  return (
    <Button variant="ghost" size="touch" onClick={() => goBack(fallback)} className={cn("-ml-3", className)}>
      <ChevronLeft aria-hidden="true" />
      Volver
    </Button>
  );
}
