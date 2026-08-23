# Offline and WebAR school runbook

## Before class

1. Confirm the published lesson/scenario version and approved training rig.
2. Charge devices, clean cameras, verify storage, and connect to school Wi-Fi.
3. Open each shared device online and install or update the OPedu PWA.
4. Open the assigned lesson, choose **Prepare for offline use**, confirm every file is saved, then
   open the active simulation once so its current attempt snapshot is stored in IndexedDB.
5. Verify Camera AR, Accessible 2D, and Desktop 3D on the lowest supported device.
6. Use **Print the approved Camera AR marker** for the exact published scenario value and attach it
   without covering controls or hazard labels. A different QR code is rejected as a marker mismatch.
7. Confirm the rig is de-energized and the instructor stop procedure is understood.

## During class

- Learners use individual accounts; authenticated sessions are not shared.
- Keep the online/offline and pending-evidence indicator visible.
- If tracking is unstable, exit AR and use Camera AR, Desktop 3D, or Accessible 2D.
- Do not penalize camera denial, tracking loss, or synchronization delay.
- The instructor may stop or invalidate an activity when the safety envelope is broken.

## Outage and recovery

1. Continue only if the lesson was opened and its required content is available locally.
2. Offline evidence is labeled pending and final server scoring is deferred.
3. After connectivity returns, select **Synchronize now** and keep the application open. A failed
   item remains on the device with its error for review; never clear it merely to remove the warning.
4. Do not clear browser storage, uninstall the PWA, or switch accounts while evidence is pending.
5. If synchronization fails, record the device, attempt ID, time, and visible error; retain the
   outbox for support review.

## Device reset and incidents

Only a school device custodian may clear installed content, after confirming that no events are
pending. For injury, unsafe placement, incorrect guidance, privacy exposure, or lost evidence:
stop the activity, preserve logs, notify the named owners, follow the approved incident process,
and do not resume until authorized.
