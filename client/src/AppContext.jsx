import { createContext, useContext } from 'react';

// Shared app state: { me, setMe, users, usersById, lists, refreshLists,
// catalogue, refreshCatalogue, navigate }.
export const AppContext = createContext(null);

export const useApp = () => useContext(AppContext);

// Lists of a kind that the current user can add to.
export function editableLists(lists, kind) {
  return (lists ?? []).filter((l) => l.kind === kind && (l.isOwner || l.isShared));
}
