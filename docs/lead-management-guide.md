# QEGOS Lead Management CRM -- Staff Guide

This document covers every workflow in the Lead Management module of the QEGOS Admin Dashboard. It is intended for onboarding new staff members and as a day-to-day reference for all roles.

---

## Table of Contents

1. [Roles and Permissions](#1-roles-and-permissions)
2. [Lead List Page](#2-lead-list-page)
3. [Filtering and Searching Leads](#3-filtering-and-searching-leads)
4. [Creating a New Lead](#4-creating-a-new-lead)
5. [Viewing Lead Details](#5-viewing-lead-details)
6. [Editing a Lead](#6-editing-a-lead)
7. [Lead Status Lifecycle](#7-lead-status-lifecycle)
8. [Status Transitions](#8-status-transitions)
9. [Marking a Lead as Lost](#9-marking-a-lead-as-lost)
10. [Reopening a Lost Lead](#10-reopening-a-lost-lead)
11. [Re-engaging a Dormant Lead](#11-re-engaging-a-dormant-lead)
12. [Logging Activities](#12-logging-activities)
13. [Creating Reminders](#13-creating-reminders)
14. [Completing Reminders](#14-completing-reminders)
15. [Assigning and Reassigning Leads](#15-assigning-and-reassigning-leads)
16. [Converting a Lead to a Client](#16-converting-a-lead-to-a-client)
17. [Deleting a Lead](#17-deleting-a-lead)
18. [Staff-Specific View](#18-staff-specific-view)
19. [Lead Scoring](#19-lead-scoring)
20. [Reference Tables](#20-reference-tables)

---

## 1. Roles and Permissions

Access to lead management features varies by role. The table below summarises what each role can do.

| Role | userType | Which Leads Are Visible | Can Assign Leads | Can Convert Leads | Can Delete Leads |
|------|----------|------------------------|------------------|-------------------|------------------|
| Super Admin | 0 | All leads | Yes | Yes | Yes |
| Admin | 1 | All leads | Yes | Yes | Yes |
| Office Manager | 2 | All leads | Yes | Yes | Yes |
| Senior Staff | 3 | All leads | Yes | Yes | Yes |
| Staff | 4 | Only leads assigned to them | No | Yes (own leads only) | No |

**Key distinction:** Staff members (userType 4) operate in a scoped view. They only see leads where they are the assigned staff member. All other roles see the full pipeline.

---

## 2. Lead List Page

Navigate to **Leads** in the sidebar to open the lead list page. The page has three sections:

### Stats Dashboard

Four summary cards appear at the top of the page:

| Card | Description |
|------|-------------|
| Active Leads | Total number of non-deleted, non-Won, non-Lost leads |
| New This Week | Leads created in the current calendar week |
| Conversion Rate | Percentage of leads that have been converted (Won) |
| Pipeline Value | Total estimated dollar value of all active leads |

### Filter Bar

Below the stats cards is a filter bar with search and dropdown filters (see Section 3).

### Lead Table

The table displays all leads matching the current filters. Columns shown:

| Column | Description |
|--------|-------------|
| Lead # | System-generated ID in format QGS-L-XXXX. Click to open the lead detail page. |
| Name | First and last name combined |
| Mobile | Phone number in formatted display |
| Source | Where the lead came from (e.g., Phone Inbound, Walk-in, Referral) |
| Status | Current lifecycle status shown as a coloured tag |
| Priority | Hot (red), Warm (orange), or Cold (blue) |
| Score | Numeric score from 0 to 100 |
| Assigned To | Name of the staff member assigned, or a dash if unassigned |
| Created | Date the lead was created |
| Actions | Eye icon button to open the lead detail page |

The table supports pagination (default 20 per page, configurable) and column sorting on Score and Created columns.

---

## 3. Filtering and Searching Leads

Use the filter bar to narrow down the lead list.

| Filter | Type | Description |
|--------|------|-------------|
| Search | Text input | Searches across first name, last name, mobile number, and email |
| Status | Dropdown | Filter by a single status (New, Contacted, Qualified, etc.) |
| Priority | Dropdown | Filter by Hot, Warm, or Cold |
| Source | Dropdown | Filter by lead source (Phone Inbound, Walk-in, Web Form, etc.) |

To clear a filter, click the X icon inside the dropdown or clear the search field. All filters reset the page back to page 1 when changed.

---

## 4. Creating a New Lead

1. Click the **New Lead** button in the top-right corner of the lead list page.
2. A modal form opens with the following sections:

### Basic Information (required fields marked with asterisk)

| Field | Required | Notes |
|-------|----------|-------|
| First Name | Yes | |
| Last Name | No | |
| Mobile | Yes | Enter in format +61412345678. Australian mobiles starting with 04 are auto-normalised to +61 format. |
| Email | No | Must be a valid email address |
| Source | Yes | Select from the dropdown (see Source reference table) |
| Priority | No | Defaults to Warm. Choose Hot, Warm, or Cold. |

### Contact Preferences

| Field | Options |
|-------|---------|
| Preferred Language | English, Chinese, Hindi, Punjabi, Vietnamese, Arabic, Other |
| Preferred Contact | Call, SMS, Email, WhatsApp |

### Location

| Field | Notes |
|-------|-------|
| Suburb | Free text |
| State | Select from NSW, VIC, QLD, SA, WA, TAS, NT, ACT |
| Postcode | Must be exactly 4 digits |

### Financial

| Field | Notes |
|-------|-------|
| Financial Year | Select from available financial years |
| Estimated Value ($) | Enter in dollars (e.g., 500). The system stores this as cents internally. |

### Demographics

| Field | Notes |
|-------|-------|
| Marital Status | Single, Married, De Facto, Separated, Divorced, Widowed |
| Employment Type | Employed, Self Employed, Contractor, Retired, Student, Unemployed, Multiple |
| Has Spouse | Toggle switch |
| Dependants | Number input (0 or more) |
| Rental Property | Toggle switch |
| Shares | Toggle switch (share portfolio) |
| Foreign Income | Toggle switch |

### Notes

Free text area for any additional information about the lead.

3. Click **OK** to create the lead.
4. The system automatically:
   - Generates a lead number (QGS-L-XXXX)
   - Sets status to New
   - Runs a duplicate check against existing leads by mobile and email
   - Calculates the initial lead score
5. If duplicates are found, the system returns a warning with matched leads. The lead is still created, but you should review the duplicates.

---

## 5. Viewing Lead Details

Click on a lead number in the list, or click the eye icon, to open the lead detail page. The page is divided into two columns.

### Left Column

**Lead Information Card** with tabbed sections:

| Tab | Fields Displayed |
|-----|-----------------|
| Contact | Name, Mobile, Email, Source, Preferred Language, Preferred Contact |
| Location | Suburb, State, Postcode |
| Financial | Financial Year, Estimated Value, Priority, Score |
| Demographics | Marital Status, Employment Type, Has Spouse, Dependants, Rental Property, Share Portfolio, Foreign Income |
| Tracking | Created Date, Last Contacted, Follow-up Count, Next Action, Next Action Date, Tags |

Below the tabs, any notes associated with the lead are displayed.

**Activity Timeline** is displayed below the lead information card. It shows all logged activities in reverse chronological order. Each activity entry shows:
- Activity type (coloured tag)
- Description text
- Outcome (if recorded)
- Sentiment (if recorded)
- Call duration (for call activities, shown as Xm Ys)
- Who performed it and when (relative time)

System-generated activities (such as status changes and assignment changes) appear with a grey tag to distinguish them from manual entries.

### Right Column

**Status Card** -- Shows the current status and buttons for valid transitions (see Section 8).

**Assignment Card** -- Shows who the lead is assigned to. Admin-level users see an Assign/Reassign button.

**Reminders Card** -- Lists pending and completed reminders. Pending reminders with a passed due date are highlighted in red and tagged as Overdue. An "Add" button opens the reminder creation modal.

**Lost Reason Card** -- Only displayed when the lead status is Lost. Shows the selected reason and any accompanying notes.

### Header Area

The header shows:
- Lead number and full name
- Status and priority tags
- Converted badge (green, if applicable)

Action buttons in the header:
- **Convert to Client** -- Shown only when the lead can be converted (status is Quote Sent or Negotiation, and not already converted)
- **Edit** -- Opens the edit modal
- **Delete** -- Red button, shown only to admin-level users (userType 0-3). Requires confirmation.

If the lead has been converted, a green success banner appears below the header with links to the associated Order and Client records.

---

## 6. Editing a Lead

1. Open the lead detail page.
2. Click the **Edit** button in the header.
3. The same form from lead creation opens, pre-filled with the current values.
4. Make changes and click **OK** to save.

Note: The estimated value field displays in dollars during editing (the system converts from the internal cents representation) and converts back to cents on save.

---

## 7. Lead Status Lifecycle

Every lead moves through a defined set of statuses. The status determines what actions are available and where the lead sits in the pipeline.

| Status | Code | Colour | Description |
|--------|------|--------|-------------|
| New | 1 | Blue | Lead has just been created. No contact has been made yet. |
| Contacted | 2 | Cyan | Initial contact has been made with the lead. |
| Qualified | 3 | Geek Blue | The lead has been assessed and confirmed as a genuine prospect. |
| Quote Sent | 4 | Orange | A quote or pricing proposal has been sent to the lead. |
| Negotiation | 5 | Gold | Active discussion about pricing or services is underway. |
| Won/Converted | 6 | Green | The lead has been converted into a client. This is a terminal status. |
| Lost | 7 | Red | The lead did not convert. A reason must be recorded. |
| Dormant | 8 | Default/Grey | The lead has gone quiet or is not currently active. |

---

## 8. Status Transitions

Leads can only move between specific statuses. The system enforces these rules and only shows valid transition buttons.

### Transition Map

| Current Status | Can Move To |
|----------------|-------------|
| New | Contacted, Lost |
| Contacted | Qualified, Lost, Dormant |
| Qualified | Quote Sent, Lost, Dormant |
| Quote Sent | Negotiation, Won (via Convert), Lost, Dormant |
| Negotiation | Won (via Convert), Lost, Dormant |
| Won | No further transitions (terminal) |
| Lost | New (reopen) |
| Dormant | Contacted (re-engage) |

### How to Change Status

1. Open the lead detail page.
2. In the **Status** card on the right column, the current status is displayed with a coloured tag.
3. Below it, buttons appear for each valid transition.
4. Click the desired status button.
5. The status changes immediately (except for Lost and Won, which have special flows described below).

### Special Cases

- **Won/Convert & Win button**: Clicking this does not directly set the status. Instead it opens the Convert to Client modal (see Section 16). The status is set to Won only after a successful conversion.
- **Lost button**: Opens a modal requiring you to select a reason and optionally add notes (see Section 9).

---

## 9. Marking a Lead as Lost

When a lead will not convert, mark it as Lost:

1. Open the lead detail page.
2. In the Status card, click the **Lost** button (shown in red).
3. A modal opens with two fields:

| Field | Required | Description |
|-------|----------|-------------|
| Reason | Yes | Select from the dropdown (see Lost Reasons table below) |
| Notes | No | Free text to explain the circumstances |

4. Click **OK** to confirm.
5. The lead status changes to Lost, and the reason is recorded and displayed in the Lost Reason card.

### Lost Reasons

| Value | Display Label |
|-------|--------------|
| price_too_high | Price Too High |
| chose_competitor | Chose Competitor |
| diy_filing | DIY Filing |
| not_interested | Not Interested |
| unreachable | Unreachable |
| timing | Bad Timing |
| already_filed | Already Filed |
| other | Other |

---

## 10. Reopening a Lost Lead

If circumstances change and a previously lost lead becomes viable again:

1. Open the lead detail page (the lead must be in Lost status).
2. In the Status card, a single **New** button is available.
3. Click it. The lead status resets to New, allowing you to restart the pipeline from the beginning.

---

## 11. Re-engaging a Dormant Lead

Dormant leads are those that have gone quiet. To re-engage:

1. Open the lead detail page (the lead must be in Dormant status).
2. In the Status card, a single **Contacted** button is available.
3. Click it. The lead moves back to Contacted status, indicating you have re-established contact.

Tip: After re-engaging, log an activity to record how you re-established contact.

---

## 12. Logging Activities

Activities are the record of every interaction with a lead. They form the timeline visible on the lead detail page.

### How to Log an Activity

1. Open the lead detail page.
2. In the Activity Timeline card, click the **Log Activity** button.
3. A modal opens with the following fields:

| Field | Required | Description |
|-------|----------|-------------|
| Activity Type | Yes | Select from grouped dropdown (see Activity Types below) |
| Description | Yes | Free text describing what happened |
| Outcome | No | Select the result of the interaction |
| Sentiment | No | Positive, Neutral, or Negative |
| Call Duration | No | Shown only for call types. Enter duration in seconds. |
| Call Direction | No | Shown only for call types. Select Inbound or Outbound. |

4. Click **OK** to save the activity.

### Activity Types (Grouped)

**Calls:**
- Outbound Call
- Inbound Call
- Missed Call
- Voicemail Left

**Messages:**
- SMS Sent
- Email Sent
- WhatsApp Sent

**Meetings:**
- Walk-in Meeting
- Video Call

**Other:**
- Note
- Document Shared
- Quote Sent

### Call-Specific Fields

When you select any call type (Outbound Call, Inbound Call, or Missed Call), two additional fields appear:

- **Call Duration (seconds):** Enter the length of the call in seconds. The timeline displays this as minutes and seconds (e.g., 3m 45s).
- **Direction:** Choose Inbound or Outbound.

### Activity Outcomes

| Value | Display Label |
|-------|--------------|
| interested | Interested |
| callback_requested | Callback Requested |
| not_interested | Not Interested |
| no_answer | No Answer |
| voicemail | Voicemail |
| busy | Busy |
| wrong_number | Wrong Number |
| meeting_booked | Meeting Booked |
| quote_requested | Quote Requested |
| converted | Converted |
| needs_documents | Needs Documents |
| thinking | Thinking |
| price_enquiry | Price Enquiry |
| other | Other |

### System-Generated Activities

Some activities are created automatically by the system and cannot be manually created:
- **Status Change** -- logged whenever a lead's status is transitioned
- **Assignment Change** -- logged when a lead is assigned or reassigned
- **Follow-up Scheduled / Completed / Missed** -- logged by the automation engine
- **Converted** -- logged when a lead is converted to a client

These appear in the timeline with a grey tag and "System" as the performer.

---

## 13. Creating Reminders

Reminders help ensure timely follow-ups with leads.

### How to Create a Reminder

1. Open the lead detail page.
2. In the **Reminders** card on the right column, click the **Add** button.
3. A modal opens with the following fields:

| Field | Required | Description |
|-------|----------|-------------|
| Title | Yes | Short description of what needs to be done |
| Description | No | Additional details |
| Date | Yes | Select the date for the reminder (DD/MM/YYYY format) |
| Time | Yes | Select the time (HH:mm format, in 15-minute increments) |
| Assign To | Yes | Select a staff member from the dropdown. Defaults to the lead's currently assigned staff member. |

4. Click **OK** to create the reminder.

### Reminder States

| State | Display |
|-------|---------|
| Pending | Shown on a light grey background in the "Pending" section |
| Overdue | Shown on a red-tinted background with an "Overdue" tag. This means the reminder date/time has passed without completion. |
| Completed | Shown in the "Completed" section with a green background and strikethrough title |

---

## 14. Completing Reminders

1. Open the lead detail page.
2. In the Reminders card, find the pending reminder you want to complete.
3. Click the **Complete** link below the reminder.
4. The reminder moves to the Completed section and records the completion timestamp.

---

## 15. Assigning and Reassigning Leads

Only admin-level users (Super Admin, Admin, Office Manager, Senior Staff -- userType 0-3) can assign or reassign leads. Staff members (userType 4) do not see the assignment controls.

### How to Assign or Reassign

1. Open the lead detail page.
2. In the **Assignment** card on the right column, click the **Assign** button (if unassigned) or the **Reassign** button (if already assigned).
3. A modal opens with a staff member dropdown.
4. Search for and select the desired staff member.
5. Click **OK** to confirm the assignment.

The system logs an assignment_change activity in the timeline automatically.

### Impact of Assignment

- When a lead is assigned to a Staff member (userType 4), that lead becomes visible in their scoped view.
- Reminders can be directed to the assigned staff member.
- Activity tracking shows who performed each action.

---

## 16. Converting a Lead to a Client

Converting a lead is the action that marks it as Won. This is an atomic operation that creates both a client (User) account and an Order in a single transaction.

### Prerequisites

- The lead must be in **Quote Sent** or **Negotiation** status.
- The lead must not already be converted.

### How to Convert

1. Open the lead detail page.
2. Click the **Convert to Client** button in the header area (or click the **Convert & Win** button in the Status card).
3. A confirmation modal opens explaining what will happen:
   - A new client account will be created using the lead's contact details
   - A new order will be created and linked to the lead
   - The lead status will be set to Won
4. Click **Create New Client & Order** to proceed.
5. On success:
   - A success message confirms the conversion
   - The lead status changes to Won/Converted
   - A green "Converted" tag appears in the header
   - A success banner appears with links to the newly created Order and Client records
   - A system activity of type "converted" is logged in the timeline

### After Conversion

- The lead status is terminal. No further status transitions are possible.
- The lead detail page shows links to navigate to the associated Order and Client records.
- All historical activities and reminders remain accessible on the lead.

---

## 17. Deleting a Lead

Only admin-level users (userType 0-3) can delete leads. The delete button is not visible to Staff members.

### How to Delete

1. Open the lead detail page.
2. Click the red **Delete** button in the header.
3. A confirmation popover appears: "Delete this lead? This action cannot be undone."
4. Click **Delete** to confirm.
5. The lead is soft-deleted (marked as deleted in the database but not permanently removed). You are redirected back to the lead list.

Soft-deleted leads do not appear in the lead list or in any filters. They are excluded from stats calculations.

---

## 18. Staff-Specific View

Staff members (userType 4) experience the lead management module differently from admin-level users.

### What Staff Members See

- **Blue info banner** at the top of the lead list page: "Showing leads assigned to you". This banner is closable.
- **Filtered lead list**: Only leads where `assignedTo` matches their user ID appear. They cannot see unassigned leads or leads assigned to other staff.
- **No Assign/Reassign button**: The Assignment card does not show the Assign/Reassign controls.
- **No Delete button**: The Delete button is not rendered.
- **Convert to Client**: Available on their own leads when the lead is in Quote Sent or Negotiation status.

### What Staff Members Can Do

- View and edit their assigned leads
- Log activities on their leads
- Create and complete reminders
- Transition lead statuses (following the state machine rules)
- Convert their own leads to clients

### What Staff Members Cannot Do

- View leads assigned to other staff or unassigned leads
- Assign or reassign leads
- Delete leads
- Access bulk operations

---

## 19. Lead Scoring

Each lead has a score from 0 to 100 that is automatically calculated by the system based on profile completeness and interaction history. The score determines the lead priority.

### Priority Thresholds

| Priority | Score Range | Tag Colour |
|----------|------------|------------|
| Hot | 61 -- 100 | Red |
| Warm | 31 -- 60 | Orange |
| Cold | 0 -- 30 | Blue |

### Scoring Factors

The score is calculated from the following factors:

**Positive Factors (increase score):**

| Factor | Points | Condition |
|--------|--------|-----------|
| Has Email | +5 | Email address is provided |
| Complete Profile | +10 | All demographic fields are filled (marital status, employment type, rental property, share portfolio, foreign income, dependants) |
| Rental Property | +15 | Lead has a rental property |
| Share Portfolio | +10 | Lead has a share portfolio |
| Self-Employed / Contractor | +15 | Employment type is self_employed or contractor |
| Multiple Services | +10 | Interested in 2 or more services |
| Has Spouse | +5 | Has spouse toggle is on |
| Has Dependants | +5 | Number of dependants is greater than 0 |
| Positive Outcome | +10 | Most recent activity outcome was positive (interested, meeting booked, quote requested) |
| Quote Requested | +10 | A quote has been requested |
| Referral Source | +10 | Lead source is referral |
| Repeat Client | +10 | Lead source is repeat_client |
| Recent Contact | +5 | Last contacted within the past 7 days |
| Foreign Income | +10 | Lead has foreign income |

**Negative Factors (decrease score):**

| Factor | Points | Condition |
|--------|--------|-----------|
| Overdue Follow-ups | -10 | Lead has overdue follow-up reminders |
| Multiple No-Answers | -15 | Multiple activities with no_answer outcome |
| Gone Cold | -20 | No contact in over 30 days |

The score is recalculated automatically when activities are logged and can also be triggered in bulk by admin users.

---

## 20. Reference Tables

### Lead Sources

| Internal Value | Display Label |
|----------------|--------------|
| phone_inbound | Phone (Inbound) |
| phone_outbound | Phone (Outbound) |
| walk_in | Walk-in |
| web_form | Web Form |
| referral | Referral |
| sms_inquiry | SMS Inquiry |
| whatsapp | WhatsApp |
| social_media | Social Media |
| marketing_campaign | Marketing Campaign |
| repeat_client | Repeat Client |
| partner | Partner |
| google_ads | Google Ads |
| facebook_ads | Facebook Ads |
| other | Other |

### Australian States

NSW, VIC, QLD, SA, WA, TAS, NT, ACT

### Preferred Languages

| Value | Label |
|-------|-------|
| en | English |
| zh | Chinese |
| hi | Hindi |
| pa | Punjabi |
| vi | Vietnamese |
| ar | Arabic |
| other | Other |

### Preferred Contact Methods

Call, SMS, Email, WhatsApp

### Marital Statuses

Single, Married, De Facto, Separated, Divorced, Widowed

### Employment Types

Employed, Self Employed, Contractor, Retired, Student, Unemployed, Multiple

### Sentiments

Positive, Neutral, Negative

### Call Directions

Inbound, Outbound

---

## Quick Reference: Common Workflows

### New lead walks in

1. Click **New Lead** on the lead list page.
2. Fill in Basic Information (first name, mobile, source = Walk-in).
3. Add any known financial and demographic details.
4. Save the lead.
5. Log an activity: type = Walk-in Meeting, describe the conversation, set outcome and sentiment.
6. Set a reminder for follow-up.

### Following up on a lead

1. Open the lead from the list.
2. Review the activity timeline and any pending reminders.
3. Make the call or send the message.
4. Log the activity with the appropriate type, outcome, and sentiment.
5. If the call type was used, record the duration and direction.
6. Update the status if appropriate (e.g., New to Contacted after first contact).
7. Complete any fulfilled reminders and create new ones as needed.

### Moving a lead through the pipeline

1. New: Create the lead.
2. Contacted: Log first contact activity, then transition status.
3. Qualified: After assessing the lead is a genuine prospect, transition status.
4. Quote Sent: Send a quote, log a Quote Sent activity, transition status.
5. Negotiation: If further discussion is needed, transition status.
6. Won: Use Convert to Client to atomically create the user account and order.

### Handling a lead that goes quiet

1. If no response after multiple follow-ups, transition status to Dormant.
2. Set a reminder for a future re-engagement date.
3. When ready to re-engage, transition from Dormant back to Contacted.
4. Log the re-engagement activity.

### Closing a lead that will not convert

1. Transition status to Lost.
2. Select the appropriate reason from the dropdown.
3. Add any relevant notes.
4. If circumstances change later, reopen the lead by transitioning from Lost to New.
