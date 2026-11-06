/**
 * What a campaign needs to be accepted by each source (client-safe). Checked in the form before sending
 * and again on the server, so a campaign never fails half-way at the source.
 */
import type { CampaignSetup } from "./store";

export type Check = { errors: string[]; warnings: string[] };

const today = () => new Date().toISOString().slice(0, 10);

/** Time zone of the country the campaign runs in (dayparting default). */
export const COUNTRY_TZ: Record<string, string> = {
  US: "America/New_York",
  UK: "Europe/London",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  CA: "America/Toronto",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  BR: "America/Sao_Paulo",
  PT: "Europe/Lisbon",
  ZA: "Africa/Johannesburg",
};

export function checkSetup(
  platform: "taboola" | "revcontent",
  s: CampaignSetup,
  ctx: { url?: string; creatives?: number; name?: string; groupNeeded?: boolean; groupChosen?: boolean } = {},
): Check {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = ctx.name ?? "";

  if (!name.trim()) errors.push("Dê um nome à campanha.");
  if (!s.countries.length) errors.push("Escolha pelo menos um país.");
  if (s.countries.some((c) => !/^[A-Z]{2}$/.test(c))) errors.push("País inválido: use o código de 2 letras (US, GB, AU…).");
  if (!s.devices.length) errors.push("Escolha pelo menos um device.");
  if (s.startDate && s.startDate < today()) errors.push("A data de início não pode ser no passado.");
  if (s.endDate && s.endDate < (s.startDate || today())) errors.push("A data final é antes da data de início.");
  if (s.schedule?.mode === "CUSTOM") {
    if (!s.schedule.days.length) errors.push("Horário personalizado: escolha pelo menos um dia.");
    if (!(s.schedule.fromHour >= 0 && s.schedule.untilHour <= 24 && s.schedule.fromHour < s.schedule.untilHour))
      errors.push("Horário personalizado: a hora inicial tem que ser antes da final (0–24).");
  }
  if (s.trackingCode && /^[?&]/.test(s.trackingCode.trim())) errors.push("Código de rastreio: tire o ? ou & do começo.");

  if (ctx.url !== undefined) {
    if (!ctx.url.trim()) errors.push("Falta o link (campanha do RedTrack).");
    else if (!/^https:\/\//i.test(ctx.url.trim())) errors.push("O link tem que começar com https://.");
  }
  if (ctx.creatives === 0) warnings.push("Sem criativos: a campanha sobe vazia (dá para adicionar depois).");

  if (platform === "taboola") {
    if (!s.brandingText.trim()) errors.push("Taboola: preencha a marca exibida (branding text).");
    if (s.brandingText.length > 25) warnings.push("Taboola: marca com mais de 25 caracteres pode ser cortada.");
    if ((s.bidStrategy === "FIXED" || s.bidStrategy === "SMART") && !(Number(s.cpc) > 0)) errors.push("Taboola: informe o CPC.");
    if (s.bidStrategy === "TARGET_CPA" && !(Number(s.cpaGoal) > 0)) errors.push("Taboola: informe o CPA alvo.");
    const limited = s.spendingLimitModel && s.spendingLimitModel !== "NONE";
    if (!(Number(s.dailyCap) > 0) && !(limited && Number(s.spendingLimit) > 0)) errors.push("Taboola: informe o orçamento diário.");
    if (limited && !(Number(s.spendingLimit) > 0)) errors.push("Taboola: informe o limite do orçamento ou escolha \"sem limite\".");
    if (limited && Number(s.dailyCap) > Number(s.spendingLimit)) errors.push("Taboola: o orçamento diário é maior que o limite total.");
    if (s.bidStrategy === "MAX_CONVERSIONS" && Number(s.dailyCap) > 0 && Number(s.dailyCap) < 20)
      warnings.push("Taboola: Max Conversions aprende mal com menos de US$20/dia.");
    if (ctx.groupNeeded && !ctx.groupChosen) errors.push("Taboola: escolha o grupo de campanhas da conta destino.");
    if (name.length > 255) errors.push("Taboola: nome com mais de 255 caracteres.");
  } else {
    if (!(Number(s.cpc) >= 0.01)) errors.push("Revcontent: informe o lance (mínimo US$0,01).");
    if (s.budget && s.budget < 50) errors.push("Revcontent: orçamento diário mínimo é US$50 (ou deixe vazio = sem limite).");
    if (s.bidStrategy === "cpa" && !s.conversionId) errors.push("Revcontent: para otimizar por CPA escolha o pixel de conversão.");
    if (s.trackingCode && s.trackingCode.length > 255) errors.push("Revcontent: código de rastreio passa de 255 caracteres.");
    if (s.schedule?.mode === "CUSTOM" && s.schedule.days.length && s.schedule.days.length < 7)
      warnings.push("Revcontent: o horário vale para todos os dias (a API não separa por dia da semana).");
    if (s.blockedSites?.some((w) => !/^\d+$/.test(w))) warnings.push("Revcontent: bloqueios são ids numéricos de widget; nomes de site serão ignorados.");
  }
  return { errors, warnings };
}
