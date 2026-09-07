{
  config,
  lib,
  pkgs,
  ...
}:

let
  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    types
    ;
  cfg = config.services.rugix-admin;
  toml = pkgs.formats.toml { };
in

{
  options.services.rugix-admin = {
    enable = mkEnableOption "the Rugix Admin local web interface";

    package = lib.mkPackageOption pkgs "rugix-admin" { };

    listenAddress = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "Address on which Rugix Admin listens.";
    };

    port = mkOption {
      type = types.port;
      default = 7492;
      description = "TCP port on which Rugix Admin listens.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Whether to open the Rugix Admin port in the firewall.";
    };
  };

  config = mkIf cfg.enable {
    services.rugix = {
      enable = true;
      daemon.enable = true;
    };

    environment.etc."rugix/admin.toml".source = toml.generate "rugix-admin.toml" {
      address = "${cfg.listenAddress}:${toString cfg.port}";
    };

    networking.firewall.allowedTCPPorts = mkIf cfg.openFirewall [ cfg.port ];

    # The daemon's restrictive umask removes directory execute bits; clients need group traversal.
    systemd.tmpfiles.rules = [ "d /run/rugix 0750 root rugix-daemon -" ];

    systemd.services.rugix-admin = {
      description = "Rugix Admin";
      wantedBy = [ "multi-user.target" ];
      requires = [ "rugix-ctrl-daemon.service" ];
      after = [ "rugix-ctrl-daemon.service" ];
      path = [ config.services.rugix.package ];
      serviceConfig = {
        Type = "simple";
        DynamicUser = true;
        User = "rugix-admin";
        Group = "rugix-daemon";
        NoNewPrivileges = true;
        ExecStart = "${cfg.package}/bin/rugix-admin";
        Restart = "on-failure";
      };
    };
  };
}
