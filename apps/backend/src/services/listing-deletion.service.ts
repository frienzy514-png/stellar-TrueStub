import { getFirestore } from "firebase-admin/firestore";
import { firebaseAdminApp } from "../config/firebase";

const LISTING_DEPENDENT_COLLECTIONS = ["listingAlerts", "watchlist", "savedSearches"] as const;

/**
 * Remove only Firestore records that explicitly point at this listing. Saved
 * searches with reusable criteria and no listingId are deliberately preserved.
 */
export async function cleanupListingDependentDocuments(listingId: string): Promise<void> {
  const firestore = getFirestore(firebaseAdminApp);

  for (const collectionName of LISTING_DEPENDENT_COLLECTIONS) {
    const snapshot = await firestore
      .collection(collectionName)
      .where("listingId", "==", listingId)
      .get();

    // Firestore batches are limited to 500 operations.
    for (let offset = 0; offset < snapshot.docs.length; offset += 500) {
      const batch = firestore.batch();
      for (const doc of snapshot.docs.slice(offset, offset + 500)) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }
  }
}
