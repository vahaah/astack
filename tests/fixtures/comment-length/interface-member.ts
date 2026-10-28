export interface UploadOptions {
	/**
	 * Largest part size in bytes. The service rejects parts above
	 * 5 GiB and below 5 MiB, except for the last part.
	 * Uploads above 10,000 parts fail, so large files need large parts.
	 * Defaults to 8 MiB.
	 */
	partSize?: number;
}
