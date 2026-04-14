export type ViewerRole = "SPYMASTER" | "OPERATOR" | null | undefined;

type VisibleCard = {
  identity: string;
  isRevealed: boolean;
};

export const shouldShowHintPanel = (role: ViewerRole): boolean => role === "SPYMASTER";

export const getVisibleIdentity = ({
  role,
  card,
}: {
  role: ViewerRole;
  card: VisibleCard;
}): string => (card.isRevealed || role === "SPYMASTER" ? card.identity : "");

export const getCardMetaLabel = ({
  role,
  card,
}: {
  role: ViewerRole;
  card: VisibleCard;
}): string => {
  const visibleIdentity = getVisibleIdentity({ role, card });

  if (!visibleIdentity) {
    return "Hidden identity";
  }

  return card.isRevealed ? `Revealed • ${visibleIdentity}` : `Hidden • ${visibleIdentity}`;
};
