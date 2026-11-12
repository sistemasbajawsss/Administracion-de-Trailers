import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { WeeklyMileageForm } from "@/features/kilometraje/components/weekly-mileage-form";
import { CaptureDaysSetting } from "@/features/kilometraje/components/capture-days-setting";
import { getCaptureDays, getWeeklyMileage } from "@/features/kilometraje/queries";
import { requireRole } from "@/lib/auth/get-current-user";
import { ROLES, VIEW_ALL_ROLES } from "@/lib/auth/types";
import { addDays, formatDate, todayInTijuana } from "@/lib/utils/format";
import { describeCaptureDays, weekStart } from "@/lib/utils/mileage";

export const metadata: Metadata = { title: "Kilometraje" };

async function Content() {
  const [user, rows, days] = await Promise.all([requireRole(ROLES), getWeeklyMileage(), getCaptureDays()]);
  const today = todayInTijuana();
  const week = weekStart(today);
  return (
    <>
      <PageHeader
        title="Kilometraje semanal"
        description={`Semana del ${formatDate(week)} al ${formatDate(addDays(week, 6))}. Escribe el kilometraje de la foto del tablero de cada unidad. Se registra ${describeCaptureDays(days)}.`}
      />
      {user.role === "admin" && <CaptureDaysSetting key={days.join(",")} days={days} />}
      <WeeklyMileageForm
        // key: semana nueva o lecturas nuevas, la lista empieza de cero.
        key={`${week}|${days.join("-")}|${rows.map((r) => `${r.unitId}:${r.reading?.id ?? ""}:${r.reading?.km ?? ""}`).join(",")}`}
        rows={rows}
        week={week}
        days={days}
        user={{ id: user.id, role: user.role }}
        today={today}
        canOpenUnits={(VIEW_ALL_ROLES as readonly string[]).includes(user.role)}
      />
    </>
  );
}

export default function KilometrajePage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Kilometraje semanal" />
          <div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        </>
      }
    >
      <Content />
    </Suspense>
  );
}
