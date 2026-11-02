{
  pkgs,
  module,
  admin,
  rugixCtrl,
}:

pkgs.testers.runNixOSTest {
  name = "rugix-admin-service";
  nodes.machine = {
    imports = [ module ];
    environment.systemPackages = [ pkgs.curl ];
    services.rugix.package = rugixCtrl;
    services.rugix-admin = {
      enable = true;
      package = admin;
      port = 17492;
    };
  };

  # Exercise the frontend and app inspection through the real privileged daemon as a dynamic user.
  testScript = ''
    import json

    machine.start()
    machine.wait_for_unit("rugix-ctrl-daemon.service")
    machine.wait_for_unit("rugix-admin.service")
    machine.wait_until_succeeds("curl --fail-with-body --silent http://127.0.0.1:17492/api/health")
    page = machine.succeed("curl --fail-with-body --silent http://127.0.0.1:17492/")
    assert "/assets/" in page
    assert "frontend has not been built" not in page
    machine.succeed("curl --fail-with-body --silent http://127.0.0.1:17492/api/daemon")
    machine.succeed("mkdir -p /var/lib/rugix/apps/incomplete/generations/1")
    info = json.loads(machine.succeed("curl --fail-with-body --silent http://127.0.0.1:17492/api/apps/incomplete"))
    assert info["lifecycle"] == {"state": "inactive"}
    generation, = info["generations"]
    assert generation["number"] == 1
    assert generation["complete"] is False
    assert "createdAt" not in generation
    assert machine.succeed("systemctl show rugix-admin.service -p DynamicUser --value").strip() == "yes"
    machine.succeed("systemctl restart rugix-admin.service")
    machine.wait_until_succeeds("curl --fail-with-body --silent http://127.0.0.1:17492/api/daemon")
  '';
}
