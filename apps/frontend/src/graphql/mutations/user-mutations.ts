import { gql } from "@apollo/client";

/**
 * Updates core user identity fields (first/last name).
 * Used by UserProfileCard on the main dashboard.
 */
export const UPDATE_USER = gql`
  mutation UpdateUser($id: uuid!, $firstName: String, $lastName: String, $phoneNumber: String, $profileImageUrl: String) {
    update_users_by_pk(
      pk_columns: { id: $id }
      _set: {
        first_name: $firstName
        last_name: $lastName
        phone_number: $phoneNumber
        profile_image_url: $profileImageUrl
      }
    ) {
      id
      email
      first_name
      last_name
      phone_number
      profile_image_url
      updated_at
    }
  }
`;

/**
 * Updates the extended profile fields.
 * Used by EditProfileForm on the profile settings page.
 */
export const UPDATE_USER_PROFILE = gql`
  mutation UpdateUserProfile(
    $id: uuid!
    $firstName: String
    $lastName: String
    $phoneNumber: String
    $countryCode: String
    $location: String
    $summary: String
  ) {
    update_users_by_pk(
      pk_columns: { id: $id }
      _set: {
        first_name: $firstName
        last_name: $lastName
        phone_number: $phoneNumber
        country_code: $countryCode
        location: $location
        summary: $summary
      }
    ) {
      id
      email
      first_name
      last_name
      phone_number
      country_code
      location
      summary
      updated_at
    }
  }
`;
