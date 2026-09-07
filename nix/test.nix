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

  # Exercise the embedded frontend and access to the real privileged daemon as a dynamic user.
  testScript = ''
    machine.start()
    machine.wait_for_unit("rugix-ctrl-daemon.service")
    machine.wait_for_unit("rugix-admin.service")
    machine.wait_until_succeeds("curl --fail-with-body --silent http://127.0.0.1:17492/api/health")
    page = machine.succeed("curl --fail-with-body --silent http://127.0.0.1:17492/")
    assert "/assets/" in page
    assert "frontend has not been built" not in page
    machine.succeed("curl --fail-with-body --silent http://127.0.0.1:17492/api/daemon")
    assert machine.succeed("systemctl show rugix-admin.service -p DynamicUser --value").strip() == "yes"
    machine.succeed("systemctl restart rugix-admin.service")
    machine.wait_until_succeeds("curl --fail-with-body --silent http://127.0.0.1:17492/api/daemon")
  '';
}
