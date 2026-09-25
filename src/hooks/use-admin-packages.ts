"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminPackagesService, type PackageKind, type RequestOf } from "@/services/admin-packages.service";

export const ADMIN_PACKAGES_KEYS = {
  all: ["admin-packages"] as const,
  options: ["admin-packages", "options"] as const,
  list: (kind: PackageKind) => ["admin-packages", kind] as const,
  drift: (kind: PackageKind, id: string) => ["admin-packages", kind, id, "drift"] as const,
};

export function useAdminPackageOptions() {
  return useQuery({
    queryKey: ADMIN_PACKAGES_KEYS.options,
    queryFn: () => adminPackagesService.getOptions(),
    staleTime: 10 * 60_000,
  });
}

/** The catalog is small and fetched whole; the list toolkit filters it in the browser. */
export function useAdminPackages<K extends PackageKind>(kind: K) {
  return useQuery({
    queryKey: ADMIN_PACKAGES_KEYS.list(kind),
    queryFn: () => adminPackagesService.list(kind),
    staleTime: 60_000,
  });
}

/** Stripe drift is read only when the panel asks — it calls Stripe for every price. */
export function useAdminPackageDrift(kind: PackageKind, id: string | null) {
  return useQuery({
    queryKey: ADMIN_PACKAGES_KEYS.drift(kind, id ?? ""),
    queryFn: () => adminPackagesService.getDrift(kind, id!),
    enabled: id !== null,
    staleTime: 0,
    retry: false,
  });
}

/**
 * Every write refreshes the whole package tree: a coupon limited to a pack reads the pack's
 * Stripe product, and sales figures move under every list.
 */
function useInvalidateAdminPackages() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ADMIN_PACKAGES_KEYS.all });
}

export function useAdminPackageMutations<K extends PackageKind>(kind: K) {
  const invalidate = useInvalidateAdminPackages();
  const onSuccess = () => void invalidate();

  const create = useMutation({
    mutationFn: (request: RequestOf<K>) =>
      adminPackagesService.create(kind, request),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, request }: { id: string; request: RequestOf<K> }) =>
      adminPackagesService.update(kind, id, request),
    onSuccess,
  });
  const duplicate = useMutation({ mutationFn: (id: string) => adminPackagesService.duplicate(kind, id), onSuccess });
  const setArchived = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => adminPackagesService.setArchived(kind, id, archived),
    onSuccess,
  });
  const sync = useMutation({ mutationFn: (id: string) => adminPackagesService.syncToStripe(kind, id), onSuccess });

  return { create, update, duplicate, setArchived, sync };
}
