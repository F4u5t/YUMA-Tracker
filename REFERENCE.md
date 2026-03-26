# Faust Lawn Maintenance — Developer Reference

This document catalogues all status enumerations, telemetry fields, API endpoints, and other
engineering details for the Faust Lawn Maintenance mower-tracker application.

Source of truth for Python enums: `pymammotion.utility.constant.device_constant`  
Source of truth for frontend labels: `frontend/src/types/mower.ts`

---

## Table of Contents

1. [System Status (WorkMode / sys_status)](#1-system-status-workmode--sys_status)
2. [Job / Task Modes](#2-job--task-modes)
3. [RTK Status](#3-rtk-status)
4. [Position Mode](#4-position-mode)
5. [Position Type (PosType)](#5-position-type-postype)
6. [Connection Preference](#6-connection-preference)
7. [Charge State](#7-charge-state)
8. [NO_REQUEST_MODES](#8-no_request_modes)
9. [Telemetry Fields](#9-telemetry-fields)
10. [TaskPlan Fields](#10-taskplan-fields)
11. [REST API Endpoints](#11-rest-api-endpoints)
12. [WebSocket Messages](#12-websocket-messages)
13. [Battery Session Tracking](#13-battery-session-tracking)
14. [BLE Order Commands (BleOrderCmd)](#14-ble-order-commands-bleordercmd)
15. [Device / Hardware Notes](#15-device--hardware-notes)

---

## 1. System Status (WorkMode / sys_status)

`sys_status` is the primary mower state field delivered in every telemetry message.  
Python class: `WorkMode(IntEnum)` in `device_constant.py`.  
Frontend map: `SYS_STATUS_LABELS` in `mower.ts`.

| Value | Python Name            | UI Label          | Notes                                           |
|-------|------------------------|-------------------|-------------------------------------------------|
| 0     | MODE_NOT_ACTIVE        | Not Active        | Device powered but not connected                |
| 1     | MODE_ONLINE            | Online            | Cloud-connected, idle                           |
| 2     | MODE_OFFLINE           | Offline           | No cloud connection                             |
| 8     | MODE_DISABLE           | Disabled          | Feature/zone disabled                           |
| 10    | MODE_INITIALIZATION    | Initializing      | Startup sequence in progress                    |
| 11    | MODE_READY             | Ready             | Fully initialized, awaiting commands            |
| 12    | *(MODE_UNCONNECTED)*   | —                 | No enum constant; appears only in `device_mode()` map |
| 13    | MODE_WORKING           | Mowing            | Active autonomous mowing                        |
| 14    | MODE_RETURNING         | Returning         | Navigating back to dock                         |
| 15    | MODE_CHARGING          | Charging          | Docked and charging                             |
| 16    | MODE_UPDATING          | Updating          | Firmware OTA in progress                        |
| 17    | MODE_LOCK              | Locked            | Safety/anti-theft lock active                   |
| 19    | MODE_PAUSE             | Paused            | Job paused by user                              |
| 20    | MODE_MANUAL_MOWING     | Manual Mowing     | Manual/joystick drive mode                      |
| 22    | MODE_UPDATE_SUCCESS    | Update Success    | Firmware OTA completed successfully             |
| 23    | MODE_OTA_UPGRADE_FAIL  | Update Failed     | Firmware OTA failed                             |
| 31    | MODE_JOB_DRAW          | Drawing Job       | User drawing a mowing zone boundary             |
| 32    | MODE_OBSTACLE_DRAW     | Drawing Obstacle  | User drawing an obstacle boundary               |
| 34    | MODE_CHANNEL_DRAW      | Drawing Channel   | User drawing a narrow-passage channel           |
| 35    | MODE_ERASER_DRAW       | Drawing Eraser    | Erasing drawn boundaries                        |
| 36    | MODE_EDIT_BOUNDARY     | Editing Boundary  | Editing an existing boundary                    |
| 37    | MODE_LOCATION_ERROR    | Location Error    | RTK/GPS position error                          |
| 38    | MODE_BOUNDARY_JUMP     | Boundary Jump     | Robot detected outside its boundary             |
| 39    | MODE_CHARGING_PAUSE    | Charging Paused   | Job paused due to low battery; docked to charge |

> **Battery tracker mowing detection**: `useBatteryTracker` considers statuses **13** and **20** as
> active mowing (`MOWING_STATUSES`).

---

## 2. Job / Task Modes

The `job_mode` field on a `TaskPlan` controls the mowing path pattern.  
Frontend map: `JOB_MODE_LABELS` in `mower.ts`.

| Value | Label        | Description                              |
|-------|--------------|------------------------------------------|
| 0     | Single Grid  | One direction of parallel passes         |
| 1     | Double Grid  | Two directions (cross-hatch)             |
| 2     | Segment      | Mow in sub-segments                      |
| 3     | No Grid      | Follow boundary / perimeter only         |

---

## 3. RTK Status

The `rtk_status` field in telemetry is sent as a **string** from the backend.  
Python class: `RTKStatus(IntEnum)` in `data/model/enums.py`.

| Value | Name    | Meaning                                          | Quality    |
|-------|---------|--------------------------------------------------|------------|
| 0     | NONE    | No RTK fix; no correction data                   | ❌ Poor    |
| 1     | SINGLE  | Single-point GPS only (no base corrections) — alt value 2 | ⚠️ Fair |
| 4     | FIX     | RTK fixed integer solution                       | ✅ Best    |
| 5     | FLOAT   | RTK floating-point solution (close to fix)       | ✅ Good    |
| 6     | UNKNOWN | Status indeterminate                             | ❓ Unknown |

---

## 4. Position Mode

Python class: `PositionMode(IntEnum)` in `data/model/enums.py`.  
Mapped to the `position_type` telemetry field.

| Value | Name    | Meaning                              |
|-------|---------|--------------------------------------|
| 0     | FIX     | RTK fixed — highest accuracy         |
| 1     | SINGLE  | Single-point GPS                     |
| 2     | FLOAT   | RTK float solution                   |
| 3     | NONE    | No position solution                 |
| 4     | UNKNOWN | Indeterminate position type          |

---

## 5. Position Type (PosType)

Python class: `PosType(IntEnum)` in `device_constant.py`.  
Describes the robot's physical location relative to mapped features.

| Value | Name                  | Meaning                                       |
|-------|-----------------------|-----------------------------------------------|
| 0     | AREA_OUT              | Outside all mapped areas                      |
| 1     | AREA_INSIDE           | Inside a mapped mowing area                   |
| 3     | CHANNEL_ON            | On a narrow-passage channel line              |
| 5     | CHARGE_ON             | On/near the charging station                  |
| 7     | AREA_BORDER_ON        | On the boundary of a mowing area              |
| 8     | DUMPING_AREA_INSIDE   | Inside a clipping-dump zone                   |
| 9     | CHANNEL_AREA_OVERLAP  | In an overlap between channel and area        |

---

## 6. Connection Preference

Python class: `ConnectionPreference(IntEnum)` in `data/model/enums.py`.  
Controls which transport the device prefers for cloud communication.

| Value | Name              | Meaning                                     |
|-------|-------------------|---------------------------------------------|
| 0     | ANY               | Use any available connection                |
| 1     | WIFI              | Wi-Fi only                                  |
| 2     | BLUETOOTH         | BLE only                                    |
| 3     | PREFER_WIFI       | Prefer Wi-Fi, fall back to BLE              |
| 4     | PREFER_BLUETOOTH  | Prefer BLE, fall back to Wi-Fi              |

---

## 7. Charge State

The `charge_state` field in telemetry is a simple integer flag.

| Value | Meaning                              |
|-------|--------------------------------------|
| 0     | Not charging (off dock)              |
| 1     | Charging (on dock, power connected)  |

---

## 8. NO_REQUEST_MODES

`NO_REQUEST_MODES` is a tuple in `device_constant.py` listing statuses where the device will
**not** accept new work commands.  
Attempting `queue_command` while in one of these modes will fail or be ignored.

| WorkMode Value | Name                |
|----------------|---------------------|
| 13             | MODE_WORKING        |
| 16             | MODE_UPDATING       |
| 17             | MODE_LOCK           |
| 20             | MODE_MANUAL_MOWING  |
| 31             | MODE_JOB_DRAW       |
| 32             | MODE_OBSTACLE_DRAW  |
| 34             | MODE_CHANNEL_DRAW   |
| 35             | MODE_ERASER_DRAW    |
| 36             | MODE_EDIT_BOUNDARY  |

> **Note**: Direct `queue_command` calls also fail with "Device not responding" when the mower is
> idle but not actively in an MQTT session. Use `start_schedule_sync` at startup to establish the
> session, then issue commands.

---

## 9. Telemetry Fields

Delivered over WebSocket (`/ws/telemetry`) as JSON with `"type": "telemetry"`.  
TypeScript interface: `Telemetry` in `mower.ts`.

| Field            | Type     | Description                                                      |
|------------------|----------|------------------------------------------------------------------|
| `type`           | string   | Always `"telemetry"`                                             |
| `position.lat`   | number   | Current mower latitude (WGS-84)                                  |
| `position.lng`   | number   | Current mower longitude (WGS-84)                                 |
| `dock.lat`       | number   | Dock/base station latitude                                       |
| `dock.lng`       | number   | Dock/base station longitude                                      |
| `dock.rotation`  | number   | Dock heading (degrees)                                           |
| `rtk_base.lat`   | number   | RTK base station latitude                                        |
| `rtk_base.lng`   | number   | RTK base station longitude                                       |
| `battery`        | number   | Battery percentage (0–100)                                       |
| `charge_state`   | number   | 0 = not charging, 1 = charging (see §7)                         |
| `satellites_total`| number  | Total GNSS satellites visible                                    |
| `satellites_l2`  | number   | L2-band satellites visible                                       |
| `rtk_status`     | string   | RTK quality string (see §3)                                      |
| `sys_status`     | number   | WorkMode value (see §1)                                          |
| `orientation`    | number   | Mower heading / yaw (degrees)                                    |
| `position_type`  | number   | PositionMode value (see §4)                                      |
| `work_zone`      | number   | Hash of the zone currently being mowed                           |
| `rtk_age`        | number   | Age of RTK correction data (seconds)                             |
| `pos_level`      | number   | Signal quality level (0–5)                                       |
| `gps_stars`      | number   | GPS-only satellite count                                         |
| `co_view_stars`  | number   | Co-view (rover + base common) satellite count                    |
| `wifi_rssi`      | number   | Wi-Fi signal strength (dBm, negative)                            |
| `device_name`    | string   | Device display name (e.g. `"Luba-VA9K4FDV"`)                    |
| `online`         | boolean  | Whether the device is reachable over MQTT                        |
| `timestamp`      | string   | ISO-8601 timestamp of this reading                               |

---

## 10. TaskPlan Fields

Returned by `GET /api/plans`. TypeScript interface: `TaskPlan` in `mower.ts`.

| Field           | Type       | Description                                                             |
|-----------------|------------|-------------------------------------------------------------------------|
| `plan_id`       | string     | Unique plan identifier (UUID-like string)                               |
| `task_name`     | string     | Human-readable task name                                                |
| `job_id`        | string     | Internal job identifier                                                 |
| `zone_hashs`    | number[]   | List of zone hash codes the task covers                                 |
| `zone_names`    | string[]   | Human-readable names matching `zone_hashs`                              |
| `job_mode`      | number     | Mowing pattern (see §2 Job/Task Modes)                                  |
| `speed`         | number     | Target mowing speed (m/s)                                               |
| `knife_height`  | number     | Blade height (mm)                                                       |
| `channel_width` | number     | Path spacing / route width (mm)                                         |
| `channel_mode`  | number     | Channel navigation mode                                                 |
| `edge_mode`     | number     | Edge/border treatment mode                                              |
| `toward`        | number     | Mowing direction angle (degrees, 0 = north)                             |

---

## 11. REST API Endpoints

Base URL: `https://<host>:18080/api`

| Method | Path                        | Description                                                       |
|--------|-----------------------------|-------------------------------------------------------------------|
| GET    | `/status`                   | Returns raw device status dict from PyMammotion state            |
| GET    | `/debug`                    | Returns full mower client debug dump                              |
| GET    | `/debug/map`                | Returns raw map state (plan dict, boundaries, zones)             |
| GET    | `/plans`                    | Returns list of `TaskPlan` objects; triggers sync if empty        |
| POST   | `/plans/sync`               | Force a full plan re-sync (waits up to 30 s)                     |
| POST   | `/plans/{plan_id}/start`    | Start the specified task plan on the mower                        |
| GET    | `/map/boundaries`           | GeoJSON FeatureCollection of yard boundaries                      |
| GET    | `/map/zones`                | List of `Zone` objects (hash, name, type)                         |
| GET    | `/map/mow-path`             | GeoJSON FeatureCollection of recorded mow path                   |
| POST   | `/command/pause`            | Pause current job                                                 |
| POST   | `/command/resume`           | Resume paused job                                                 |
| POST   | `/command/dock`             | Return mower to dock                                              |
| POST   | `/command/cancel`           | Cancel current job                                                |
| POST   | `/refresh`                  | Request a telemetry refresh from the device                       |
| POST   | `/reconnect`                | Disconnect and reconnect to Mammotion cloud (non-blocking)        |
| GET    | `/camera/token`             | Get Agora camera streaming token                                  |

---

## 12. WebSocket Messages

WebSocket URL: `wss://<host>:18080/ws/telemetry`

Two message types are broadcast:

### `telemetry`

Full device state, emitted ~1 Hz when connected. See [§9 Telemetry Fields](#9-telemetry-fields).

### `sat_sample`

Satellite snapshot emitted when the mower moves, used to build the RTK heatmap.

| Field        | Type   | Description                             |
|-------------|--------|-----------------------------------------|
| `type`       | string | Always `"sat_sample"`                   |
| `lat`        | number | Latitude at sample time                 |
| `lng`        | number | Longitude at sample time                |
| `satellites` | number | Total satellite count at this location  |
| `rtk_status` | string | RTK quality string (see §3)             |

---

## 13. Battery Session Tracking

The frontend tracks battery consumption per mowing session in `localStorage`.

### Key Details

| Item                    | Value                                        |
|-------------------------|----------------------------------------------|
| localStorage key        | `faust_battery_sessions`                     |
| Max stored sessions     | 20 (oldest pruned first)                     |
| Sample interval         | 30 seconds while `sys_status` ∈ {13, 20}    |
| Session start triggers  | `sys_status` enters 13 (Mowing) or 20 (Manual Mowing) |
| Session end triggers    | `sys_status` leaves {13, 20}                 |

### `BatterySession` Object

| Field        | Type             | Description                                              |
|-------------|------------------|----------------------------------------------------------|
| `id`         | string           | ISO-8601 start timestamp (used as unique key)            |
| `taskName`   | string           | Task name from `TaskList` (empty string if started outside a plan) |
| `startPct`   | number           | Battery % at session start                               |
| `readings`   | BatteryReading[] | Time-series samples `{ ts: epochMs, pct: number }`       |
| `endPct`     | number?          | Battery % at session end (absent for active session)     |
| `durationMs` | number?          | Session wall-clock duration in milliseconds              |

---

## 14. BLE Order Commands (BleOrderCmd)

Numeric command codes sent over BLE. Partial list of commonly used values:

| Value | Name                      | Purpose                                         |
|-------|---------------------------|-------------------------------------------------|
| 1     | sendControl               | Send a direct movement/direction control        |
| 2     | sendContrlCallBack        | Control command acknowledgement                 |
| 5     | batteryValueUpdate        | Request battery value update                    |
| 6     | sendExecuteTask           | Send/start a mowing task                        |
| 7     | pauseExecuteTask          | Pause current task                              |
| 8     | returnCharge              | Command return-to-dock                          |
| 28    | setKnifeHight             | Set blade/knife height                          |
| 30    | taskProgressUpdate        | Task progress update event                      |
| 31    | deviceStatusUpdate        | Device status push                              |
| 32    | sendPlan                  | Send a plan/map to device                       |
| 33    | setMaxSpeed               | Set maximum working speed                       |
| 37    | sendFramwareUpdate        | Initiate firmware update                        |
| 41    | checkFramwareVersion      | Check current firmware version                  |
| 47    | cancelPauseExecuteTask    | Cancel pause / resume                           |
| 57    | synTime                   | Synchronise device clock                        |
| 60    | startWorkOrder            | Start a work order                              |
| 78    | job_plan_setting_read_delete | Read or delete a saved plan                  |
| 208   | getHashList               | Request list of zone hashes                     |
| 209   | getAreaData               | Request area/zone data                          |
| 210   | generateRouteInformation  | Generate navigation route                       |
| 211   | retrunGenerateRouteInformation | Return generated route data               |
| 212   | startjob                  | Start a job (newer API)                         |
| 213   | task                      | Generic task command                            |

---

## 15. Device / Hardware Notes

### Registered Device

| Property      | Value                         |
|---------------|-------------------------------|
| Model         | Mammotion Luba 2              |
| Serial suffix | VA9K4FDV                      |
| IoT ID        | `4DY9GdAp81o9ofs2mqmfog8oRD`  |
| Location      | Bristol, VA area (≈ 36.601°N, 82.114°W) |
| Backend port  | **18080** (HTTPS/WSS only)    |

### MQTT Brokers

Two MQTT sessions are maintained simultaneously:

| Name               | Purpose                                     |
|--------------------|---------------------------------------------|
| `*_aliyun`         | Alibaba Cloud IoT Core (primary data path)  |
| `*_mammotion`      | Mammotion proprietary broker (redundant)    |

| Library    | `pymammotion` (installed in `C:\Python314\Lib\site-packages\`) |
| TLS cert   | Self-signed, generated by `backend/generate_cert.py`    |
