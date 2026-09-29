import { gql } from '@apollo/client';

export const UPDATE_NOTIFICATION_PREFERENCES = gql`
  mutation UpdateNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
    updateNotificationPreferences(input: $input) {
      id
      emailEnabled
      pushEnabled
      smsEnabled
      listingAlerts
      priceDrops
      newMessages
      marketingEmails
    }
  }
`;
