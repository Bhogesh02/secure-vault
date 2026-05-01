import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fileApi } from "../lib/api/files";
import { folderApi } from "../lib/api/folders";
import { userApi } from "../lib/api/user";
import { Session, VaultFile } from "../types/domain";

export function useVault(session: Session, folderId: number, folderPassword?: string, activeTab?: string) {
  const queryClient = useQueryClient();

  // Queries
  const foldersQuery = useQuery({
    queryKey: ["folders"],
    queryFn: () => folderApi.list(session.accessToken).then(res => res.data.folders),
    enabled: !!session,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const filesQuery = useQuery({
    queryKey: ["files", folderId, folderPassword, activeTab],
    queryFn: () => fileApi.list(session.accessToken, folderId, folderPassword, activeTab).then(res => res.data.files),
    enabled: !!session && (folderId === 0 || !!folderPassword || !!activeTab),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: () => userApi.getStats(session.accessToken).then(res => res.data),
    enabled: !!session,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Mutations with Optimistic UI
  const createFolderMutation = useMutation({
    mutationFn: (data: { name: string; password?: string }) => folderApi.create(session.accessToken, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: (data: { folderId: number; file: Blob | File; password?: string; metadata?: { salt: string; iv: string }; onProgress?: (p: number) => void }) => {
      const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
      const file = data.file;

      if (file.size <= CHUNK_SIZE) {
        return fileApi.upload(session.accessToken, data.folderId, file, data.password, data.metadata);
      }

      // Large file: use multipart upload
      return (async () => {
        const start = await fileApi.startMultipart(session.accessToken, {
          filename: (file as File).name || "unnamed",
          contentType: file.type || "application/octet-stream",
          folderId: data.folderId,
          size: file.size
        });

        const { uploadId, key } = start.data;
        const totalParts = Math.ceil(file.size / CHUNK_SIZE);
        const parts: { partNumber: number; etag: string }[] = [];

        for (let i = 0; i < totalParts; i++) {
          const startByte = i * CHUNK_SIZE;
          const endByte = Math.min(startByte + CHUNK_SIZE, file.size);
          const chunk = file.slice(startByte, endByte);
          
          const partRes = await fileApi.uploadPart(session.accessToken, uploadId, key, i + 1, chunk);
          parts.push({ partNumber: i + 1, etag: partRes.data.etag });
          
          if (data.onProgress) {
            data.onProgress(Math.round(((i + 1) / totalParts) * 100));
          }
        }

        return fileApi.completeMultipart(session.accessToken, {
          uploadId,
          key,
          parts,
          filename: (file as File).name || "unnamed",
          folderId: data.folderId,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          encryptionSalt: data.metadata?.salt,
          encryptionIv: data.metadata?.iv
        });
      })();
    },
    onSuccess: () => {
      // Invalidate everything under "files" and "stats"
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      // Force immediate refetch of the current view
      queryClient.refetchQueries({ queryKey: ["files", folderId, folderPassword, activeTab] });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (data: { fileId: number; password?: string }) => fileApi.delete(session.accessToken, data.fileId, data.password),
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["files", folderId, folderPassword, activeTab] });

      // Snapshot the previous value
      const previousFiles = queryClient.getQueryData<VaultFile[]>(["files", folderId, folderPassword, activeTab]);

      // Optimistically update to the new value
      if (previousFiles) {
        queryClient.setQueryData<VaultFile[]>(["files", folderId, folderPassword, activeTab], 
          previousFiles.filter(f => f.id !== variables.fileId)
        );
      }

      return { previousFiles };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousFiles) {
        queryClient.setQueryData(["files", folderId, folderPassword, activeTab], context.previousFiles);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we are in sync with the server
      queryClient.invalidateQueries({ queryKey: ["files", folderId, folderPassword, activeTab] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const purgeFileMutation = useMutation({
    mutationFn: (fileId: number) => fileApi.purge(session.accessToken, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.refetchQueries({ queryKey: ["files", folderId, folderPassword, activeTab] });
    },
  });

  const restoreFileMutation = useMutation({
    mutationFn: (fileId: number) => fileApi.restore(session.accessToken, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.refetchQueries({ queryKey: ["files", folderId, folderPassword, activeTab] });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (targetFolderId: number) => folderApi.delete(session.accessToken, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const unlockFolderMutation = useMutation({
    mutationFn: (data: { folderId: number; password: string }) => folderApi.unlock(session.accessToken, data.folderId, data.password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
    }
  });

  return {
    folders: foldersQuery.data ?? [],
    files: filesQuery.data ?? [],
    stats: statsQuery.data ?? null,
    isLoading: foldersQuery.isLoading || (folderId !== 0 && filesQuery.isLoading) || statsQuery.isLoading,
    isError: foldersQuery.isError || filesQuery.isError || statsQuery.isError,
    
    createFolder: createFolderMutation.mutateAsync,
    uploadFile: uploadFileMutation.mutateAsync,
    deleteFile: deleteFileMutation.mutateAsync,
    purgeFile: purgeFileMutation.mutateAsync,
    restoreFile: restoreFileMutation.mutateAsync,
    deleteFolder: deleteFolderMutation.mutateAsync,
    unlockFolder: unlockFolderMutation.mutateAsync,
    
    isBusy: createFolderMutation.isPending || uploadFileMutation.isPending || deleteFileMutation.isPending || purgeFileMutation.isPending || restoreFileMutation.isPending || deleteFolderMutation.isPending || unlockFolderMutation.isPending
  };
}
