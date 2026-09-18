import { useState, useCallback } from 'react';
import { scanMediaContent, showAdultContentBlockedAlert, ModerationResult } from '@/services/contentModeration';

export function useContentFilter() {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [lastViolation, setLastViolation] = useState<ModerationResult | null>(null);

  /**
   * Scans a single media file before upload silently in the background.
   * If inappropriate, alerts the user, clears the input, and returns false.
   */
  const scanFile = useCallback(async (
    file: File | Blob | string,
    inputElementToReset?: HTMLInputElement | null
  ): Promise<boolean> => {
    setIsScanning(true);
    setLastViolation(null);

    try {
      const result = await scanMediaContent(file);

      if (!result.isSafe) {
        setLastViolation(result);

        // Clear the input element to cancel the selection
        if (inputElementToReset) {
          inputElementToReset.value = '';
        }

        showAdultContentBlockedAlert(result.message);
        return false;
      }

      return true;
    } catch (err) {
      console.warn('Content filter evaluation warning:', err);
      return true;
    } finally {
      setIsScanning(false);
    }
  }, []);

  /**
   * Scans multiple files silently and returns only the safe ones, or null if any failed moderation
   */
  const scanFiles = useCallback(async (
    files: FileList | File[],
    inputElementToReset?: HTMLInputElement | null
  ): Promise<File[] | null> => {
    setIsScanning(true);
    setLastViolation(null);

    const fileList = Array.from(files);

    try {
      for (const file of fileList) {
        const result = await scanMediaContent(file);
        if (!result.isSafe) {
          setLastViolation(result);

          if (inputElementToReset) {
            inputElementToReset.value = '';
          }

          showAdultContentBlockedAlert(result.message);
          return null;
        }
      }

      return fileList;
    } catch (err) {
      console.warn('Multi-file filter warning:', err);
      return fileList;
    } finally {
      setIsScanning(false);
    }
  }, []);

  return {
    isScanning,
    lastViolation,
    scanFile,
    scanFiles
  };
}
