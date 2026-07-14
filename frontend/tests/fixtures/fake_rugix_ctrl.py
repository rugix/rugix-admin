#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path


def main() -> int:
    fake_dir = os.environ.get("RUGIX_ADMIN_FAKE_DIR")
    if not fake_dir:
        print("RUGIX_ADMIN_FAKE_DIR is not set", file=sys.stderr)
        return 2

    state = Path(fake_dir)
    args = sys.argv[1:]
    record(state, "commands.jsonl", {"timestamp": now(), "args": args})

    if args == ["system", "info", "--json"]:
        boot = None
        if not (state / "no-boot-flow").exists():
            boot = {
                "bootFlow": "grub",
                "activeGroup": "b",
                "defaultGroup": "a",
                "groups": {"a": {}, "b": {}},
            }
        system_info = {
            "state": {"status": "Active", "dataPartition": "/dev/vda6"},
            "slots": {
                "system-a": {
                    "active": False,
                    "hashes": {"sha256": "a" * 64},
                    "size": 536870912,
                    "updatedAt": "2026-07-13T08:30:00Z",
                },
                "system-b": {
                    "active": True,
                    "hashes": {"sha256": "b" * 64},
                    "size": 536870912,
                    "updatedAt": "2026-07-14T09:45:00Z",
                },
            },
        }
        if boot is not None:
            system_info["boot"] = boot
        write_json(
            system_info
        )
        return 0

    if args == ["components", "check"]:
        if (state / "component-conflicts").exists():
            write_json(component_conflicts_report())
        else:
            write_json(components_report())
        return 0

    if args == ["apps", "list"]:
        write_json(
            {
                "custom-hmi": {
                    "status": {"state": "running"},
                    "generation": 5,
                    "metadata": {"label": "Custom Line HMI"},
                },
                "influxdb-historian": {
                    "status": {"state": "running"},
                    "generation": 4,
                    "metadata": {"label": "InfluxDB Historian"},
                },
                "grafana-dashboards": {
                    "status": {"state": "running"},
                    "generation": 7,
                    "metadata": {"label": "Grafana Dashboards"},
                },
                "mqtt-broker": {
                    "status": {"state": "running"},
                    "generation": 3,
                    "metadata": {"label": "MQTT Broker"},
                },
                "opc-ua-adapter": {
                    "status": {"state": "unhealthy", "message": "OPC UA endpoint health check failed"},
                    "generation": 4,
                    "metadata": {"label": "OPC UA Adapter"},
                },
                "node-red-flows": {
                    "status": {"state": "running"},
                    "generation": 6,
                    "metadata": {"label": "Node-RED Flows"},
                },
                "modbus-normalizer": {
                    "status": {"state": "stopped"},
                    "generation": 2,
                    "metadata": {"label": "Modbus Normalizer"},
                },
            }
        )
        return 0

    if len(args) == 3 and args[:2] == ["apps", "info"]:
        write_json(app_info(args[2]))
        return 0

    if is_url_update_command(args):
        print("fake system update download started")
        write_json({"event": "UpdateProgress", "progress": 12.4})
        print("fake system update install running")
        write_json({"event": "UpdateProgress", "progress": 100.0})
        return 0

    if is_upload_command(args):
        early_exit = state / "early-exit-next-upload"
        if early_exit.exists():
            early_exit.unlink()
            kind = "system-update" if args[0] == "update" else "app-install"
            record(
                state,
                "early-exits.jsonl",
                {
                    "timestamp": now(),
                    "kind": kind,
                    "args": args,
                },
            )
            print(f"fake {kind} failed before reading stdin", file=sys.stderr)
            return 23

        payload = sys.stdin.buffer.read()
        kind = "system-update" if args[0] == "update" else "app-install"
        record(
            state,
            "uploads.jsonl",
            {
                "timestamp": now(),
                "kind": kind,
                "args": args,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            },
        )
        print(f"fake {kind} received {len(payload)} bytes")
        return 0

    print(f"fake rugix-ctrl ran: {' '.join(args)}")
    return 0


def components_report() -> dict:
    apps = [
        ("custom-hmi", 5),
        ("influxdb-historian", 4),
        ("grafana-dashboards", 7),
        ("mqtt-broker", 3),
        ("opc-ua-adapter", 4),
        ("node-red-flows", 6),
        ("modbus-normalizer", 2),
    ]
    return {
        "roots": [
            {"kind": "System", "path": "/usr/lib/rugix/components"},
            {"kind": "Local", "path": "/etc/rugix/components"},
            {"kind": "Runtime", "path": "/run/rugix/components"},
            *[
                {
                    "kind": "App",
                    "path": f"/var/lib/rugix/apps/{app}/generations/{generation}/.rugix/components",
                    "app": app,
                    "generation": generation,
                }
                for app, generation in apps
            ],
        ],
        "components": [
            component(
                "System",
                "/usr/lib/rugix/components/nexigon-agent.toml",
                "nexigon-agent",
                "2026.7.0",
                provides=[
                    {"id": "nexigon-agent", "version": "1"},
                    {"id": "container.workloads", "version": "1"},
                    {"id": "rugix.apps", "version": "1"},
                ],
                claims=[{"id": "system.root"}, {"id": "workload.supervisor"}],
            ),
            component(
                "Local",
                "/etc/rugix/components/industrial-protocols.toml",
                "industrial-protocols",
                "1.5.0",
                provides=[
                    {"id": "protocol.opcua", "version": "1.05"},
                    {"id": "protocol.modbus.tcp", "version": "1"},
                    {"id": "protocol.mqtt", "version": "5"},
                ],
                requires=[{"id": "nexigon-agent"}],
            ),
            component(
                "Local",
                "/etc/rugix/components/production-line-a.toml",
                "plant.line-a",
                "3.4.2",
                provides=[
                    {"id": "cell.paint-shop", "value": "line-a"},
                    {"id": "network.machine-lan", "value": "10.80.12.0/24"},
                    {"id": "hmi.touch-panel", "value": "panel-12"},
                ],
                claims=[{"id": "line-a"}],
                requires=[{"id": "nexigon-agent"}],
            ),
            component(
                "Runtime",
                "/run/rugix/components/can0.toml",
                "plant.can0",
                "2.1.0",
                provides=[
                    {"id": "hardware.can.interface", "value": "can0"},
                    {"id": "sensor.temperature", "value": "oven-zone"},
                    {"id": "sensor.vibration", "value": "paint-pump"},
                ],
                claims=[{"id": "hardware.can.interface.can0"}],
                requires=[{"id": "network.machine-lan"}],
            ),
            component(
                "App",
                "/var/lib/rugix/apps/custom-hmi/generations/5/.rugix/components/app.toml",
                "app.custom-hmi",
                "5.2.0",
                app="custom-hmi",
                generation=5,
                provides=[
                    {"id": "hmi.operator-console", "value": "line-a"},
                    {"id": "dashboard.shift-overview"},
                ],
                claims=[{"id": "tcp.port.8080"}],
                requires=[
                    {"id": "hmi.touch-panel"},
                    {"id": "mqtt.topic.line-a"},
                    {"id": "historian.query-api"},
                ],
            ),
            component(
                "App",
                "/var/lib/rugix/apps/influxdb-historian/generations/4/.rugix/components/app.toml",
                "app.influxdb-historian",
                "4.8.1",
                app="influxdb-historian",
                generation=4,
                provides=[
                    {"id": "historian.timeseries", "value": "influxdb"},
                    {"id": "historian.query-api"},
                    {"id": "retention.policy", "value": "180d"},
                ],
                claims=[{"id": "volume.historian"}],
                requires=[{"id": "container.workloads"}, {"id": "mqtt.topic.line-a"}],
            ),
            component(
                "App",
                "/var/lib/rugix/apps/grafana-dashboards/generations/7/.rugix/components/app.toml",
                "app.grafana-dashboards",
                "7.1.3",
                app="grafana-dashboards",
                generation=7,
                provides=[
                    {"id": "dashboard.grafana", "value": "quality"},
                    {"id": "dashboard.grafana", "value": "maintenance"},
                ],
                claims=[{"id": "tcp.port.3000"}],
                requires=[{"id": "historian.query-api"}],
            ),
            component(
                "App",
                "/var/lib/rugix/apps/mqtt-broker/generations/3/.rugix/components/app.toml",
                "app.mqtt-broker",
                "3.0.4",
                app="mqtt-broker",
                generation=3,
                provides=[
                    {"id": "mqtt.broker", "version": "5"},
                    {"id": "mqtt.topic.line-a"},
                    {"id": "mqtt.topic.maintenance"},
                ],
                claims=[{"id": "tcp.port.1883"}],
                requires=[{"id": "network.machine-lan"}],
            ),
            component(
                "App",
                "/var/lib/rugix/apps/opc-ua-adapter/generations/4/.rugix/components/app.toml",
                "app.opc-ua-adapter",
                "4.6.0",
                app="opc-ua-adapter",
                generation=4,
                provides=[
                    {"id": "opcua.namespace", "value": "line-a"},
                    {"id": "mqtt.publisher", "value": "opcua"},
                ],
                claims=[{"id": "tcp.port.4840"}],
                requires=[
                    {"id": "protocol.opcua"},
                    {"id": "mqtt.broker"},
                    {"id": "hardware.can.interface", "value": "can0"},
                ],
            ),
            component(
                "App",
                "/var/lib/rugix/apps/node-red-flows/generations/6/.rugix/components/app.toml",
                "app.node-red-flows",
                "6.3.5",
                app="node-red-flows",
                generation=6,
                provides=[
                    {"id": "workflow.nodered", "value": "andon"},
                    {"id": "workflow.nodered", "value": "maintenance"},
                ],
                claims=[{"id": "tcp.port.1880"}],
                requires=[{"id": "mqtt.broker"}, {"id": "historian.timeseries"}],
            ),
            component(
                "App",
                "/var/lib/rugix/apps/modbus-normalizer/generations/2/.rugix/components/app.toml",
                "app.modbus-normalizer",
                "2.9.0",
                app="modbus-normalizer",
                generation=2,
                provides=[
                    {"id": "mqtt.publisher", "value": "modbus"},
                    {"id": "metric.normalizer", "value": "energy"},
                ],
                requires=[
                    {"id": "protocol.modbus.tcp"},
                    {"id": "mqtt.broker"},
                ],
            ),
        ],
        "consistent": True,
        "problems": [],
    }


def component_conflicts_report() -> dict:
    report = components_report()
    maintenance_panel = component(
        "App",
        "/var/lib/rugix/apps/maintenance-panel/generations/1/.rugix/components/app.toml",
        "app.maintenance-panel",
        "1.0.0",
        app="maintenance-panel",
        generation=1,
        provides=[
            {"id": "dashboard.maintenance-panel"},
            {"id": "hmi.service-console"},
        ],
        claims=[{"id": "tcp.port.8080"}],
        requires=[
            {"id": "hardware.can.interface", "value": "can1"},
            {"id": "mqtt.topic.maintenance"},
        ],
    )
    report["roots"].append(
        {
            "kind": "App",
            "path": "/var/lib/rugix/apps/maintenance-panel/generations/1/.rugix/components",
            "app": "maintenance-panel",
            "generation": 1,
        }
    )
    report["components"].append(maintenance_panel)
    report["consistent"] = False
    report["problems"] = [
        {
            "kind": "UnsatisfiedRequirement",
            "component": component_ref(
                "app.maintenance-panel",
                "App",
                "/var/lib/rugix/apps/maintenance-panel/generations/1/.rugix/components/app.toml",
                app="maintenance-panel",
                generation=1,
            ),
            "selector": {"id": "hardware.can.interface", "value": "can1"},
        },
        {
            "kind": "DuplicateClaim",
            "id": "tcp.port.8080",
            "components": [
                component_ref(
                    "app.custom-hmi",
                    "App",
                    "/var/lib/rugix/apps/custom-hmi/generations/5/.rugix/components/app.toml",
                    app="custom-hmi",
                    generation=5,
                ),
                component_ref(
                    "app.maintenance-panel",
                    "App",
                    "/var/lib/rugix/apps/maintenance-panel/generations/1/.rugix/components/app.toml",
                    app="maintenance-panel",
                    generation=1,
                ),
            ],
        },
        {
            "kind": "UnsatisfiedRequirement",
            "component": component_ref(
                "app.node-red-flows",
                "App",
                "/var/lib/rugix/apps/node-red-flows/generations/6/.rugix/components/app.toml",
                app="node-red-flows",
                generation=6,
            ),
            "selector": {"id": "edge-os", "version": "2026.06"},
        },
    ]
    return report


def component(
    kind: str,
    path: str,
    component_id: str,
    version: str,
    *,
    provides: list[dict],
    claims: list[dict] | None = None,
    requires: list[dict] | None = None,
    conflicts: list[dict] | None = None,
    app: str | None = None,
    generation: int | None = None,
) -> dict:
    source = {"kind": kind, "path": path}
    if app is not None:
        source["app"] = app
    if generation is not None:
        source["generation"] = generation
    return {
        "source": source,
        "component": {
            "id": component_id,
            "version": version,
            "provides": provides,
            "claims": claims or [],
            "requires": requires or [],
            "conflicts": conflicts or [],
        },
    }


def component_ref(
    component_id: str,
    kind: str,
    path: str,
    *,
    app: str | None = None,
    generation: int | None = None,
) -> dict:
    source = {"kind": kind, "path": path}
    if app is not None:
        source["app"] = app
    if generation is not None:
        source["generation"] = generation
    return {"id": component_id, "source": source}


def app_info(name: str) -> dict:
    app_generations = {
        "custom-hmi": 5,
        "influxdb-historian": 4,
        "grafana-dashboards": 7,
        "mqtt-broker": 3,
        "opc-ua-adapter": 4,
        "node-red-flows": 6,
        "modbus-normalizer": 2,
    }
    stopped_apps = {"modbus-normalizer"}
    unhealthy_apps = {"opc-ua-adapter"}
    active_generation = app_generations.get(name, 1)
    if name in unhealthy_apps:
        status = {"state": "unhealthy", "message": "OPC UA endpoint health check failed"}
    elif name in stopped_apps:
        status = {"state": "stopped"}
    else:
        status = {"state": "running"}
    generations = [
        {
            "number": active_generation,
            "createdAt": "2026-06-30T07:45:00Z",
            "complete": True,
            "active": True,
            "lastActivated": "2026-06-30T08:00:00Z",
            "metadata": {"label": name},
        }
    ]
    for offset, timestamp in enumerate(
        ["2026-06-27T14:20:00Z", "2026-06-21T09:10:00Z"],
        start=1,
    ):
        if active_generation <= offset:
            break
        generations.append(
            {
                "number": active_generation - offset,
                "createdAt": timestamp,
                "complete": True,
                "active": False,
                "lastActivated": timestamp,
                "metadata": {"label": f"{name} previous"},
            }
        )
    return {
        "name": name,
        "status": status,
        "state": {"state": "active", "generation": active_generation},
        "generations": generations,
    }


def is_url_update_command(args: list[str]) -> bool:
    return bool(args and args[0:2] == ["update", "install"] and args[-1].startswith(("http://", "https://")))


def is_upload_command(args: list[str]) -> bool:
    return bool(
        args
        and args[-1] == "-"
        and (
            args[:2] == ["update", "install"]
            or args[:2] == ["apps", "install"]
        )
    )


def write_json(value: object) -> None:
    print(json.dumps(value, separators=(",", ":")))


def record(state: Path, file_name: str, value: object) -> None:
    state.mkdir(parents=True, exist_ok=True)
    with (state / file_name).open("a", encoding="utf-8") as file:
        file.write(json.dumps(value, separators=(",", ":")) + "\n")


def now() -> str:
    return datetime.now(tz=UTC).isoformat()


if __name__ == "__main__":
    raise SystemExit(main())
