/**
 * Deletes a file from a subfolder. 
 * Returns true if deleted or already missing.
 */
export async function deleteJsonFile(root, sub, filename) {
  try {
    const dir = await getDir(root, sub);
    await dir.removeEntry(filename);
    console.log(`Successfully deleted ${sub}/${filename}`);
    return true;
  } catch (e) {
    if (e.name === 'NotFoundError') {
      console.warn(`File ${filename} was not found in ${sub}, likely already deleted.`);
      return true; // Consider this a success
    }
    throw e; // Rethrow actual permission or system errors
  }
}