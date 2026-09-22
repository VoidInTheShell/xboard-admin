package updater

const (
	// UpdateProtocol is the task protocol this executor speaks.
	UpdateProtocol = 2
	// UpdateProtocolMin is the oldest task protocol this executor accepts.
	// Keeping it explicit allows a future protocol bump to stay installable
	// through releases published with the older protocol.
	UpdateProtocolMin = 2
	UpdaterStateSchema = 1
)

var (
	BuildVersionValue = "dev"
	BuildTimeValue    = "unknown"
)

func BuildVersion() string {
	if BuildVersionValue == "" {
		return "dev"
	}
	return BuildVersionValue
}
