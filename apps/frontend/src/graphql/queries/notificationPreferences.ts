import { gql } from '@apollo/client';

export const GET_NOTIFICATION_PREFERENCES = gql`
  query GetNotificationPreferences {
    notificationPreferences {
      id
      emailEnabled
      pushEnabled
      smsEnabled
      listingAlerts
      priceDrops
      newMessages
      marketingEmails
      updatedAt
    }
  }
`;

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
      updatedAt
    }
  }
`;
